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
};

export async function buildRulesContext(uid: string): Promise<RulesContext> {
  const [categoriesSnap, automationsSnap] = await Promise.all([
    adminDb.collection("users").doc(uid).collection("categories").get(),
    adminDb.collection("users").doc(uid).collection("automations").get(),
  ]);

  const categories = categoriesSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Category, "id">) })
  );

  const automations = new Map<string, string>();
  automationsSnap.docs.forEach((d) => {
    const data = d.data() as Automation;
    automations.set(data.merchantKey, data.categoryId);
  });

  return { categories, automations };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Plain substring match: does the transaction's merchant/description text
 * contain the category's name or any of its keywords?
 *
 * Deliberately simple for now — no category/amount/recurrence weighting.
 * The first category (in Firestore doc order) that matches wins.
 */
function isKeywordMatch(haystack: string, category: Category): boolean {
  const keywords = (category.keywords ?? []).concat(category.name);
  return keywords.some((kw: string) => kw.trim().length > 0 && haystack.includes(normalizeMerchant(kw)));
}

// ---------------------------------------------------------------------------
// applyRules
// ---------------------------------------------------------------------------

/**
 * Assigns a transaction to a category using, in order:
 *   1. A manual automation (merchant -> category override) — always wins.
 *   2. The first category whose name/keywords appear in the merchant text.
 *   3. Otherwise leaves the transaction unassigned ("Needs Review") — both
 *      fields set to null, not a sentinel string.
 *
 * assignmentType mirrors the matched category's `kind` directly (income,
 * expense, or transaction) — there's no separate "cashflow"/"transfer"
 * distinction anymore now that account transfers are just categories with
 * kind "transaction".
 */
export async function applyRules<T extends {
  merchantName: string | null;
  rawName: string;
  category: PlaidTransaction["personal_finance_category"] | null;
  assignmentType: CategoryKind | null;
  assignmentId: string | null;
}>(transaction: T, context: RulesContext): Promise<T> {
  const merchantKey = normalizeMerchant(transaction.merchantName ?? transaction.rawName);

  // 1. Manual automation always wins.
  const automatedCategoryId = context.automations.get(merchantKey);
  if (automatedCategoryId) {
    const automatedCategory = context.categories.find((c) => c.id === automatedCategoryId);
    // Automation points at a category that no longer exists (deleted after
    // the automation was created) — fall through to keyword matching rather
    // than assigning a dangling id.
    if (automatedCategory) {
      return { ...transaction, assignmentType: automatedCategory.kind, assignmentId: automatedCategory.id };
    }
  }

  // 2. Simple keyword/name match.
  const match = context.categories.find((c) => isKeywordMatch(merchantKey, c));
  if (match) {
    return { ...transaction, assignmentType: match.kind, assignmentId: match.id };
  }

  // 3. No match — leave for the user to review.
  return { ...transaction, assignmentType: null, assignmentId: null };
}