import { adminDb } from "@/lib/firebaseAdmin";
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
function resolveWinner(counts: Record<string, number>): string | null {
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;

  const [topId, topCount] = ranked[0];
  const runnerUpCount = ranked[1]?.[1] ?? 0;

  if (topCount < MIN_SAMPLES) return null;
  if (topCount - runnerUpCount < MIN_MARGIN) return null;

  return topId;
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

export async function buildRulesContext(uid: string): Promise<RulesContext> {
  const [categoriesSnap, automationsSnap, statsSnap] = await Promise.all([
    adminDb.collection("users").doc(uid).collection("categories").get(),
    adminDb.collection("users").doc(uid).collection("automations").get(),
    adminDb.collection("users").doc(uid).collection("categoryPlaidStats").get(),
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
    const data = d.data() as { counts?: Record<string, number> };
    const winner = resolveWinner(data.counts ?? {});
    if (winner) plaidCategoryDefaults.set(d.id, winner);
  });

  return { categories, automations, plaidCategoryDefaults };
}

// ---------------------------------------------------------------------------
// applyRules
// ---------------------------------------------------------------------------

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
 * expense, or transfer).
 *
 * NOTE: field names here are categoryKind/categoryId to match Firestore
 * transaction docs and useTransactions.ts. (Previously this file and
 * syncService.ts used assignmentType/assignmentId, a stale name that meant
 * synced transactions were writing to fields the client never read — fixed
 * as part of this change; see syncService.ts.)
 */
export async function applyRules<T extends {
  merchantName: string | null;
  rawName: string;
  category: PlaidTransaction["personal_finance_category"] | null;
  categoryKind: CategoryKind | null;
  categoryId: string | null;
}>(transaction: T, context: RulesContext): Promise<T> {
  const merchantKey = normalizeMerchant(transaction.merchantName ?? transaction.rawName);

  // 1. Manual automation always wins.
  const automatedCategoryId = context.automations.get(merchantKey);
  if (automatedCategoryId) {
    const automatedCategory = context.categories.find((c) => c.id === automatedCategoryId);
    if (automatedCategory) {
      return { ...transaction, categoryKind: automatedCategory.kind, categoryId: automatedCategory.id };
    }
    // Automation points at a category that no longer exists — fall through.
  }

  // 2. Learned Plaid-category default.
  const detailedCode = transaction.category?.detailed;
  if (detailedCode) {
    const learnedCategoryId = context.plaidCategoryDefaults.get(detailedCode);
    if (learnedCategoryId) {
      const learnedCategory = context.categories.find((c) => c.id === learnedCategoryId);
      if (learnedCategory) {
        return { ...transaction, categoryKind: learnedCategory.kind, categoryId: learnedCategory.id };
      }
      // Learned category was deleted since the stats accrued — fall through.
    }
  }

  // 3. No match — leave for the user to review.
  return { ...transaction, categoryKind: null, categoryId: null };
}