import { adminDb } from "@/lib/firebaseAdmin";
import type { Transaction as PlaidTransaction } from "plaid";
import type { Cashflow } from "@/lib/types/types.ts"; 

/**
 * Rolling match statistics used for amount/recurrence scoring.
 * Optional on Cashflow since new cashflows won't have any yet.
 */
export type CashflowMatchStats = {
  count: number;
  avgAmount: number;
  merchantFrequency: Record<string, number>; // normalized merchant -> count
};

/**
 * Manual merchant -> cashflow override, created when a user corrects
 * a transaction (Phase 2) or defines one explicitly.
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
// Normalization + individual scoring signals
// ---------------------------------------------------------------------------

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function textSimilarityScore(haystack: string, cashflow: Cashflow): number {
  const keywords = (cashflow.keywords ?? []).concat(cashflow.name);
  if (keywords.length === 0) return 0;

  const normalized = normalizeMerchant(haystack);
  const matches = keywords.filter((kw) =>
    normalized.includes(kw.toLowerCase())
  ).length;

  return matches / keywords.length;
}

function categoryMatchScore(
  category: PlaidTransaction["personal_finance_category"] | null,
  cashflow: Cashflow
): number {
  const plaidCategories = cashflow.plaidCategories ?? [];
  if (!category || plaidCategories.length === 0) return 0;

  const set = new Set(plaidCategories.map((c) => c.toUpperCase()));
  const detailed = category.detailed?.toUpperCase();
  const primary = category.primary?.toUpperCase();

  if (detailed && set.has(detailed)) return 1;
  if (primary && set.has(primary)) return 0.6; // less specific match
  return 0;
}

function amountSimilarityScore(amount: number, cashflow: Cashflow): number {
  const stats = cashflow.matchStats;
  if (!stats || stats.count === 0) return 0;

  const diff = Math.abs(amount - stats.avgAmount);
  const scale = Math.max(Math.abs(stats.avgAmount), 1);
  return Math.max(0, 1 - diff / scale);
}

function recurrenceScore(merchantKey: string, cashflow: Cashflow): number {
  const stats = cashflow.matchStats;
  if (!stats || stats.count === 0) return 0;

  const freq = stats.merchantFrequency[merchantKey] ?? 0;
  return Math.min(1, freq / stats.count);
}

// ---------------------------------------------------------------------------
// Scoring + applyRules
// ---------------------------------------------------------------------------

const WEIGHTS = {
  text: 4,
  category: 3,
  amount: 1.5,
  recurrence: 1.5,
};

const CONFIDENCE_THRESHOLD = 5; // out of a max of 10; tune against real data

function scoreCashflow(
  tx: {
    merchantName: string | null;
    rawName: string;
    amount: number;
    category: PlaidTransaction["personal_finance_category"] | null;
  },
  merchantKey: string,
  cashflow: Cashflow
): number {
  const haystack = tx.merchantName ?? tx.rawName;

  const text = textSimilarityScore(haystack, cashflow);
  const category = categoryMatchScore(tx.category, cashflow);
  const amount = amountSimilarityScore(tx.amount, cashflow);
  const recurrence = recurrenceScore(merchantKey, cashflow);

  return (
    text * WEIGHTS.text +
    category * WEIGHTS.category +
    amount * WEIGHTS.amount +
    recurrence * WEIGHTS.recurrence
  );
}

/**
 * Assigns a cashflowId to a transaction using, in order:
 *   1. A manual automation (merchant -> cashflow override) — always wins.
 *   2. The highest-scoring cashflow, if it clears CONFIDENCE_THRESHOLD.
 *   3. Otherwise leaves cashflowId as null ("Needs Review").
 *
 * Phase 2 will replace the scoring internals (weights, signals) but the
 * signature and control flow here should stay stable.
 */
export async function applyRules<T extends {
  merchantName: string | null;
  rawName: string;
  amount: number;
  category: PlaidTransaction["personal_finance_category"] | null;
  cashflowId: string | null;
}>(transaction: T, context: RulesContext): Promise<T> {
  const merchantKey = normalizeMerchant(transaction.merchantName ?? transaction.rawName);

  
  // For now, just assign a random cashflowId from the list of cashflows. 
  // In Phase 2, this will be replaced with a scoring algorithm.
  const bestCashflow = context.cashflows[Math.floor(Math.random() * context.cashflows.length)];
  const bestCashflowId = bestCashflow?.id ?? null;

  return { ...transaction, cashflowId: bestCashflowId };
}