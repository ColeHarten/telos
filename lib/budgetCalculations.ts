import { hasPlaidTransferLabel, isLoanMovement } from "@/lib/transfers";
import type { Account, Category, Transaction } from "@/lib/types/types";

// Pure budget and cash-flow math shared by the Dashboard and Budgets pages.
// Hidden transactions are left out of every total.

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
    if (tx.hidden || !tx.categoryId || !isInMonth(tx.date, monthKey)) continue;
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
    if (tx.hidden || !tx.categoryId || !isInMonth(tx.date, monthKey)) continue;
    if (tx.categoryKind !== "income" && tx.categoryKind !== "expense") continue;
    if (categoriesById.get(tx.categoryId)?.isArchived) transactionCount += 1;
  }
  return { income, expense, total: income + expense, transactionCount };
}

type TransferFields = Pick<
  Transaction,
  "categoryKind" | "plaidCategoryPrimary" | "plaidCategoryDetailed" | "transferPairId"
>;

/**
 * True for money moving between your own accounts: anything categorized as a
 * transfer, and uncategorized transactions that are paired with their other
 * leg or that Plaid labels a transfer or a card or loan payment.
 */
export function isTransfer(tx: TransferFields): boolean {
  if (tx.categoryKind === "transfer") return true;
  if (tx.categoryKind) return false;
  return Boolean(tx.transferPairId) || hasPlaidTransferLabel(tx);
}

/**
 * Waiting for you to categorize: uncategorized, not hidden, and not a paired
 * transfer or a card or loan payment (those are transfers already).
 */
export function needsReview(tx: TransferFields & Pick<Transaction, "hidden">): boolean {
  if (tx.categoryKind || tx.hidden || tx.transferPairId) return false;
  return !isLoanMovement(tx);
}

/**
 * Net money moved into each account by transfers in one month, counted once:
 * a linked account from its own transactions, and a manual account (which
 * has none) from the transfers categorized to it. Withdrawals count against
 * the account, and each total is floored at 0.
 */
export function transferActualsByAccount(
  transactions: readonly Transaction[],
  accounts: readonly Pick<Account, "id" | "isManual">[],
  monthKey: string
): Map<string, number> {
  const linked = new Set(accounts.filter((account) => !account.isManual).map((account) => account.id));
  const net = new Map<string, number>();
  const add = (accountId: string, value: number) => net.set(accountId, (net.get(accountId) ?? 0) + value);

  for (const tx of transactions) {
    if (tx.hidden || !isInMonth(tx.date, monthKey) || !isTransfer(tx)) continue;
    // Plaid amounts are positive for money out, so money in is -amount.
    if (linked.has(tx.originAccId)) add(tx.originAccId, -tx.amount);
    if (tx.categoryKind === "transfer" && tx.transferAccountId && !linked.has(tx.transferAccountId)) {
      add(tx.transferAccountId, tx.amount);
    }
  }

  const floored = new Map<string, number>();
  for (const [id, value] of net) floored.set(id, Math.max(0, value));
  return floored;
}

export type CashFlow = { inflow: number; outflow: number; net: number };

/**
 * A category's planned amount for a month: its saved budget line, or the
 * category's monthly estimate if the line was never set. The Budgets page
 * lines show the same value.
 */
export function plannedAmount(
  category: Pick<Category, "id" | "estimatedMonthly">,
  lines: Readonly<Record<string, { planned?: number }>>
): number {
  const line = lines[`category_${category.id}`];
  const value = Number(line ? line.planned ?? 0 : category.estimatedMonthly ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Money out in one month that has no category yet (Needs Review). Budgets
 * show it as its own line, so their actuals add up to cash flow.
 */
export function uncategorizedSpending(
  transactions: readonly Transaction[],
  monthKey: string
): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const tx of transactions) {
    if (tx.amount <= 0 || !isInMonth(tx.date, monthKey) || !needsReview(tx)) continue;
    total += tx.amount;
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}

/** Inflow and outflow for one month, excluding transfers and hidden transactions. */
export function monthCashFlow(transactions: readonly Transaction[], monthKey: string): CashFlow {
  let inflow = 0;
  let outflow = 0;
  for (const tx of transactions) {
    if (tx.hidden || !isInMonth(tx.date, monthKey) || isTransfer(tx)) continue;
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
