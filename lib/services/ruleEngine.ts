import { adminDb } from "@/lib/firebaseAdmin";
import type { Transaction as PlaidTransaction } from "plaid";
import type { AssignmentType, Cashflow } from "@/lib/types/types.ts";

/**
 * Manual merchant -> cashflow override, created when a user corrects
 * a transaction (Phase 2) or defines one explicitly. Always takes
 * precedence over keyword matching.
 */
export type Automation = {
  id: string; // normalized merchant key, doubles as doc id
  merchantKey: string;
  cashflowId: string;
  createdAt?: unknown;
};

/**
 * Everything applyRules needs to score transactions for one user.
 * Fetched once per sync run, not once per transaction.
 */
export type RulesContext = {
  cashflows: Cashflow[];
  automations: Map<string, string>; // merchantKey -> cashflowId
};

export async function buildRulesContext(uid: string): Promise<RulesContext> {
  const [cashflowsSnap, automationsSnap] = await Promise.all([
    adminDb.collection("users").doc(uid).collection("cashflows").get(),
    adminDb.collection("users").doc(uid).collection("automations").get(),
  ]);

  const cashflows = cashflowsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Cashflow, "id">) })
  );

  const automations = new Map<string, string>();
  automationsSnap.docs.forEach((d) => {
    const data = d.data() as Automation;
    automations.set(data.merchantKey, data.cashflowId);
  });

  return { cashflows, automations };
}

// ---------------------------------------------------------------------------
// Normalization + matching
// ---------------------------------------------------------------------------

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Plain substring match: does the transaction's merchant/description text
 * contain the cashflow's name or any of its keywords?
 *
 * Deliberately simple for now — no category/amount/recurrence weighting.
 * The first cashflow (in Firestore doc order) that matches wins.
 */
function isKeywordMatch(haystack: string, cashflow: Cashflow): boolean {
  const keywords = (cashflow.keywords ?? []).concat(cashflow.name);
  return keywords.some((kw) => kw.trim().length > 0 && haystack.includes(normalizeMerchant(kw)));
}

// ---------------------------------------------------------------------------
// applyRules
// ---------------------------------------------------------------------------

/**
 * Assigns a transaction to a cashflow using, in order:
 *   1. A manual automation (merchant -> cashflow override) — always wins.
 *   2. The first cashflow whose name/keywords appear in the merchant text.
 *   3. Otherwise leaves the transaction unassigned ("Needs Review").
 *
 * Signature intentionally mirrors the assignmentType/assignmentId shape
 * used everywhere else (useTransactions.ts, dashboard) so callers don't
 * need to translate between a `cashflowId` and an assignment pair.
 */
export async function applyRules<T extends {
  merchantName: string | null;
  rawName: string;
  category: PlaidTransaction["personal_finance_category"] | null;
  assignmentType: AssignmentType;
  assignmentId: string | null;
}>(transaction: T, context: RulesContext): Promise<T> {
  const merchantKey = normalizeMerchant(transaction.merchantName ?? transaction.rawName);

  // 1. Manual automation always wins.
  const automatedCashflowId = context.automations.get(merchantKey);
  if (automatedCashflowId) {
    return { ...transaction, assignmentType: "cashflow", assignmentId: automatedCashflowId };
  }

  // 2. Simple keyword/name match.
  const match = context.cashflows.find((cf) => isKeywordMatch(merchantKey, cf));
  if (match) {
    return { ...transaction, assignmentType: "cashflow", assignmentId: match.id };
  }

  // 3. No match — leave for the user to review.
  return { ...transaction, assignmentType: "unassigned", assignmentId: null };
}