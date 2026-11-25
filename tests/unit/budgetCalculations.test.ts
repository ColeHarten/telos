import { describe, expect, it } from "vitest";
import {
  accountBalance,
  archivedCategoryActuals,
  categoryActuals,
  isTransfer,
  monthCashFlow,
  monthKeysEndingAt,
  netWorth,
  shiftMonthKey,
  transferActualsByAccount,
} from "@/lib/budgetCalculations";
import type { Account, Category, Transaction } from "@/lib/types/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t",
    originAccId: "checking",
    originAccName: "Checking",
    displayName: "Merchant",
    amount: 0,
    date: "2026-03-05",
    pending: false,
    plaidCategoryPrimary: null,
    plaidCategoryDetailed: null,
    categoryKind: undefined,
    categoryId: undefined,
    transferAccountId: null,
    ...overrides,
  };
}

function account(overrides: Partial<Account>): Account {
  return {
    id: "a",
    name: "Account",
    accountType: "cash",
    normalBalance: "asset",
    isManual: true,
    isArchived: false,
    isContributionEligible: false,
    ...overrides,
  };
}

const categories = new Map<string, Pick<Category, "kind" | "isArchived">>([
  ["food", { kind: "expense", isArchived: false }],
  ["coffee", { kind: "expense", isArchived: false }],
  ["salary", { kind: "income", isArchived: false }],
  ["old", { kind: "expense", isArchived: true }],
]);

describe("month helpers", () => {
  it("shifts across year boundaries", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2025-12", 1)).toBe("2026-01");
  });

  it("lists month keys oldest first", () => {
    expect(monthKeysEndingAt("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("categoryActuals", () => {
  const transactions = [
    tx({ categoryKind: "expense", categoryId: "food", amount: 50 }),
    tx({ categoryKind: "expense", categoryId: "food", amount: -20 }),
    tx({ categoryKind: "expense", categoryId: "coffee", amount: -10 }),
    tx({ categoryKind: "income", categoryId: "salary", amount: -3000 }),
    tx({ categoryKind: "expense", categoryId: "food", amount: 100, date: "2026-02-28" }),
    tx({ categoryKind: "transfer", categoryId: "savings", amount: 400 }),
  ];
  const actuals = categoryActuals(transactions, categories, "2026-03");

  it("nets refunds against spending", () => {
    expect(actuals.get("food")).toBe(30);
  });

  it("floors a category at zero", () => {
    expect(actuals.get("coffee")).toBe(0);
  });

  it("counts income as a positive actual", () => {
    expect(actuals.get("salary")).toBe(3000);
  });

  it("ignores other months and transfers", () => {
    expect(actuals.has("savings")).toBe(false);
  });
});

describe("archivedCategoryActuals", () => {
  it("totals money on archived categories", () => {
    const transactions = [
      tx({ categoryKind: "expense", categoryId: "old", amount: 40 }),
      tx({ categoryKind: "expense", categoryId: "old", amount: 15 }),
      tx({ categoryKind: "expense", categoryId: "food", amount: 99 }),
    ];
    const actuals = categoryActuals(transactions, categories, "2026-03");
    expect(archivedCategoryActuals(transactions, categories, actuals, "2026-03")).toEqual({
      income: 0,
      expense: 55,
      total: 55,
      transactionCount: 2,
    });
  });
});

describe("transfers and cash flow", () => {
  it("treats uncategorized Plaid transfers and card payments as transfers", () => {
    expect(isTransfer(tx({ plaidCategoryPrimary: "TRANSFER_IN" }))).toBe(true);
    expect(isTransfer(tx({ plaidCategoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }))).toBe(true);
    expect(isTransfer(tx({ categoryKind: "transfer" }))).toBe(true);
  });

  it("respects the user's category over Plaid's label", () => {
    expect(isTransfer(tx({ categoryKind: "expense", plaidCategoryPrimary: "TRANSFER_OUT" }))).toBe(false);
  });

  it("excludes transfers from cash flow", () => {
    const transactions = [
      tx({ categoryKind: "income", categoryId: "salary", amount: -3000 }),
      tx({ categoryKind: "expense", categoryId: "food", amount: 50 }),
      tx({ categoryKind: "expense", categoryId: "food", amount: -20 }),
      tx({ amount: 500, plaidCategoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
      tx({ amount: 200, categoryKind: "transfer", transferAccountId: "savings" }),
      tx({ amount: -100, plaidCategoryPrimary: "TRANSFER_IN" }),
      tx({ amount: 75, date: "2026-04-01" }),
    ];
    expect(monthCashFlow(transactions, "2026-03")).toEqual({ inflow: 3020, outflow: 50, net: 2970 });
  });

  it("sums transfers by destination account", () => {
    const transactions = [
      tx({ categoryKind: "transfer", transferAccountId: "savings", amount: 200 }),
      tx({ categoryKind: "transfer", transferAccountId: "savings", amount: -50 }),
    ];
    expect(transferActualsByAccount(transactions, "2026-03").get("savings")).toBe(250);
  });
});

describe("net worth", () => {
  it("falls back to starting balance", () => {
    expect(accountBalance({ startingBalance: 500 })).toBe(500);
    expect(accountBalance({ currentBalance: 0, startingBalance: 500 })).toBe(0);
  });

  it("subtracts liabilities and skips archived accounts", () => {
    const accounts = [
      account({ id: "checking", currentBalance: 1000 }),
      account({ id: "brokerage", accountType: "investment", startingBalance: 500 }),
      account({ id: "card", accountType: "credit_card", normalBalance: "liability", currentBalance: 200 }),
      account({ id: "closed", currentBalance: 999, isArchived: true }),
    ];
    expect(netWorth(accounts)).toEqual({ total: 1300, cash: 1000, investments: 500, debt: 200, assets: 1500 });
  });
});
