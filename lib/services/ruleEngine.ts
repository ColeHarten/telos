import "server-only";

import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeMerchant } from "@/lib/merchant";
import type { Automation, Category, CategoryKind } from "@/lib/types/types";
import type { Transaction as PlaidTransaction } from "plaid";

/**
 * Everything applyRules needs to score transactions for one user.
 * Fetched once per sync run, not once per transaction.
 */
export type RulesContext = {
  categories: Category[];
  automations: Map<string, string>; // merchantKey -> categoryId
  plaidCategoryDefaults: Map<string, string>; // plaidDetailedCode -> categoryId
};

// ---------------------------------------------------------------------------
// Confidence resolution for learned Plaid-category -> Category mappings
// ---------------------------------------------------------------------------

/**
 * A code needs at least this many corrections pointing at the same category
 * before Tier 2 will auto-assign on it. Below this, a single miscategorized
 * transaction could otherwise hijack the whole code.
 */
const MIN_SAMPLES = 3;

/**
 * The winning category must lead the runner-up by at least this many
 * corrections. Guards against a near-even split (e.g. 4 vs 3) being treated
 * as a confident signal.
 */
const MIN_MARGIN = 2;

/**
 * Picks a winning categoryId from a { categoryId: count } map, or null if
 * the signal isn't strong enough yet. Pure function — no I/O — so it's easy
 * to unit test independent of Firestore.
 */
export function resolveWinner(counts: Record<string, number>): string | null {
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;

  const [topId, topCount] = ranked[0];
  const runnerUpCount = ranked[1]?.[1] ?? 0;

  if (topCount < MIN_SAMPLES) return null;
  if (topCount - runnerUpCount < MIN_MARGIN) return null;

  return topId;
}

/**
 * Learning votes from a categoryPlaidStats doc: { categoryId: count }. Reads
 * the nested `counts` map and the old literal "counts.<id>" fields that
 * earlier versions wrote by mistake.
 */
export function readVotes(data: Record<string, unknown>): Record<string, number> {
  const votes: Record<string, number> = {};
  const add = (categoryId: string, value: unknown) => {
    if (typeof value === "number" && value > 0 && categoryId) votes[categoryId] = (votes[categoryId] ?? 0) + value;
  };
  const nested = data.counts;
  if (nested && typeof nested === "object") {
    for (const [categoryId, value] of Object.entries(nested as Record<string, unknown>)) add(categoryId, value);
  }
  for (const [field, value] of Object.entries(data)) {
    if (field.startsWith("counts.")) add(field.slice("counts.".length), value);
  }
  return votes;
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

export async function buildRulesContext(uid: string): Promise<RulesContext> {
  const [categoriesSnap, automationsSnap, statsSnap] = await Promise.all([
    getAdminDb().collection("users").doc(uid).collection("categories").get(),
    getAdminDb().collection("users").doc(uid).collection("automations").get(),
    getAdminDb().collection("users").doc(uid).collection("categoryPlaidStats").get(),
  ]);

  const categories = categoriesSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Category, "id">) })
  );

  const automations = new Map<string, string>();
  automationsSnap.docs.forEach((d) => {
    const data = d.data() as Automation;
    automations.set(data.merchantKey, data.categoryId);
  });

  const plaidCategoryDefaults = new Map<string, string>();
  statsSnap.docs.forEach((d) => {
    const winner = resolveWinner(readVotes(d.data()));
    if (winner) plaidCategoryDefaults.set(d.id, winner);
  });

  return { categories, automations, plaidCategoryDefaults };
}

// ---------------------------------------------------------------------------
// applyRules
// ---------------------------------------------------------------------------

/**
 * Resolves the transferAccountId to store on a transaction for a matched
 * category: the category's own transferAccountId when it's a transfer
 * category, otherwise null. Denormalizing this onto the transaction (rather
 * than re-deriving it later from categoryId) is what lets budget "actual"
 * totals and the account-deletion isolation check (see useAccounts.ts)
 * keep working even after the source Category is hard-deleted (see
 * reconcileContributionTransfers in useCategories.ts).
 */
function resolveTransferAccountId(category: Category): string | null {
  return category.kind === "transfer" ? category.transferAccountId ?? null : null;
}

/**
 * Assigns a transaction to a category using, in order:
 *   1. A manual automation (merchant -> category override) — always wins.
 *   2. A learned Plaid-category default: if enough past manual corrections
 *      agree that transactions with this Plaid `detailed` code belong to the
 *      same category, assign it there. Replaces keyword/name substring
 *      matching entirely.
 *   3. Otherwise leaves the transaction unassigned ("Needs Review") — both
 *      fields set to null, not a sentinel string.
 *
 * categoryKind mirrors the matched category's `kind` directly (income,
 * expense, or transfer). transferAccountId is set alongside it whenever the
 * matched category is a transfer category — see resolveTransferAccountId.
 *
 * Both the automation match and the learned-default match are skipped if
 * the matched category has since been archived — an archived category
 * shouldn't keep silently absorbing newly-synced transactions just because
 * an old automation or learned mapping still points at it. Each tier falls
 * through to the next when this happens (same as when the matched category
 * no longer exists at all).
 */
export function applyRules<T extends {
  merchantName: string | null;
  rawName: string;
  category: PlaidTransaction["personal_finance_category"] | null;
  categoryKind: CategoryKind | null;
  categoryId: string | null;
  transferAccountId: string | null;
}>(transaction: T, context: RulesContext): T {
  const merchantKey = normalizeMerchant(transaction.merchantName ?? transaction.rawName);

  // 1. Manual automation always wins — unless the category it points at has
  // since been archived, in which case fall through to tier 2 rather than
  // keep assigning new transactions to a retired category.
  const automatedCategoryId = context.automations.get(merchantKey);
  if (automatedCategoryId) {
    const automatedCategory = context.categories.find((c) => c.id === automatedCategoryId);
    if (automatedCategory && !automatedCategory.isArchived) {
      return {
        ...transaction,
        categoryKind: automatedCategory.kind,
        categoryId: automatedCategory.id,
        transferAccountId: resolveTransferAccountId(automatedCategory),
      };
    }
    // Automation points at a category that no longer exists, or has been
    // archived — fall through.
  }

  // 2. Learned Plaid-category default — same archived-category fallthrough
  // as tier 1 above.
  const detailedCode = transaction.category?.detailed;
  if (detailedCode) {
    const learnedCategoryId = context.plaidCategoryDefaults.get(detailedCode);
    if (learnedCategoryId) {
      const learnedCategory = context.categories.find((c) => c.id === learnedCategoryId);
      if (learnedCategory && !learnedCategory.isArchived) {
        return {
          ...transaction,
          categoryKind: learnedCategory.kind,
          categoryId: learnedCategory.id,
          transferAccountId: resolveTransferAccountId(learnedCategory),
        };
      }
      // Learned category was deleted, or archived, since the stats accrued
      // — fall through.
    }
  }

  // 3. No match — leave for the user to review.
  return { ...transaction, categoryKind: null, categoryId: null, transferAccountId: null };
}