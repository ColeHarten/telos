import type { Account, Category, Transaction } from "@/lib/types/types";

// Pure budget and cash-flow math shared by the Dashboard and Budgets pages.

/** "YYYY-MM" for the current local month. */
export function getCurrentMonthKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

/** Shifts a "YYYY-MM" key by a number of months (negative goes back). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The `count` month keys ending at `endMonthKey`, oldest first. */
export function monthKeysEndingAt(endMonthKey: string, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) keys.push(shiftMonthKey(endMonthKey, -i));
  return keys;
}

/** True when a "YYYY-MM-DD" date falls in a "YYYY-MM" month. */
export function isInMonth(date: string, monthKey: string): boolean {
  return date.startsWith(monthKey);
}

type CategoryLookup = Map<string, Pick<Category, "kind" | "isArchived">>;

/**
 * Actuals per income or expense category for one month. Refunds net against
 * spending (and reversals against income), and each category is floored at 0.
 * Plaid amounts are positive for money out and negative for money in.
 */
export function categoryActuals(
  transactions: readonly Transaction[],
  categoriesById: CategoryLookup,
  monthKey: string
): Map<string, number> {
  const net = new Map<string, number>();
  for (const tx of transactions) {
    if (!tx.categoryId || !isInMonth(tx.date, monthKey)) continue;
    if (tx.categoryKind !== "income" && tx.categoryKind !== "expense") continue;
    if (!categoriesById.has(tx.categoryId)) continue;
    const signed = tx.categoryKind === "income" ? -tx.amount : tx.amount;
    net.set(tx.categoryId, (net.get(tx.categoryId) ?? 0) + signed);
  }
  const floored = new Map<string, number>();
  for (const [id, value] of net) floored.set(id, Math.max(0, value));
  return floored;
}

export type ArchivedActuals = {
  income: number;
  expense: number;
  total: number;
  transactionCount: number;
};

/** Money assigned this month to archived categories, which the budget lines don't show. */
export function archivedCategoryActuals(
  transactions: readonly Transaction[],
  categoriesById: CategoryLookup,
  actuals: Map<string, number>,
  monthKey: string
): ArchivedActuals {
  let income = 0;
  let expense = 0;
  for (const [id, value] of actuals) {
    const category = categoriesById.get(id);
    if (!category?.isArchived) continue;
    if (category.kind === "income") income += value;
    else expense += value;
  }
  let transactionCount = 0;
  for (const tx of transactions) {
    if (!tx.categoryId || !isInMonth(tx.date, monthKey)) continue;
    if (tx.categoryKind !== "income" && tx.categoryKind !== "expense") continue;
    if (categoriesById.get(tx.categoryId)?.isArchived) transactionCount += 1;
  }
  return { income, expense, total: income + expense, transactionCount };
}

/** Transfers into each destination account for one month. */
export function transferActualsByAccount(transactions: readonly Transaction[], monthKey: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.categoryKind !== "transfer" || !tx.transferAccountId || !isInMonth(tx.date, monthKey)) continue;
    map.set(tx.transferAccountId, (map.get(tx.transferAccountId) ?? 0) + Math.abs(tx.amount));
  }
  return map;
}

const PLAID_TRANSFER_PRIMARY = new Set(["TRANSFER_IN", "TRANSFER_OUT"]);
const PLAID_TRANSFER_DETAILED = new Set(["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"]);

/**
 * True for money moving between the user's own accounts: anything categorized
 * as a transfer, plus uncategorized transactions Plaid labels as a transfer
 * or a credit-card payment.
 */
export function isTransfer(tx: Pick<Transaction, "categoryKind" | "plaidCategoryPrimary" | "plaidCategoryDetailed">): boolean {
  if (tx.categoryKind === "transfer") return true;
  if (tx.categoryKind) return false;
  return (
    PLAID_TRANSFER_PRIMARY.has(tx.plaidCategoryPrimary ?? "") ||
    PLAID_TRANSFER_DETAILED.has(tx.plaidCategoryDetailed ?? "")
  );
}

export type CashFlow = { inflow: number; outflow: number; net: number };

/** Inflow and outflow for one month, excluding transfers. */
export function monthCashFlow(transactions: readonly Transaction[], monthKey: string): CashFlow {
  let inflow = 0;
  let outflow = 0;
  for (const tx of transactions) {
    if (!isInMonth(tx.date, monthKey) || isTransfer(tx)) continue;
    if (tx.amount < 0) inflow += -tx.amount;
    else outflow += tx.amount;
  }
  return { inflow, outflow, net: inflow - outflow };
}

/** An account's balance, falling back to its starting balance. */
export function accountBalance(account: Pick<Account, "currentBalance" | "startingBalance">): number {
  return account.currentBalance ?? account.startingBalance ?? 0;
}

export type NetWorth = { total: number; cash: number; investments: number; debt: number; assets: number };

/** Net worth across active accounts. */
export function netWorth(accounts: readonly Account[]): NetWorth {
  let cash = 0;
  let investments = 0;
  let debt = 0;
  for (const account of accounts) {
    if (account.isArchived) continue;
    const balance = accountBalance(account);
    if (account.normalBalance === "liability") debt += balance;
    else if (account.accountType === "cash") cash += balance;
    else investments += balance;
  }
  return { total: cash + investments - debt, cash, investments, debt, assets: cash + investments };
}
