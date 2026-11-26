import { describe, expect, it } from "vitest";
import { hasPlaidTransferLabel, isLoanMovement, pairTransfers, type PairInput } from "@/lib/transfers";

function leg(id: string, overrides: Partial<PairInput>): PairInput {
  return {
    id,
    originAccId: "checking",
    amount: 100,
    date: "2026-03-05",
    categoryKind: undefined,
    transferAccountId: null,
    plaidCategoryPrimary: "TRANSFER_OUT",
    plaidCategoryDetailed: "TRANSFER_OUT_SAVINGS",
    hidden: false,
    ...overrides,
  };
}

describe("Plaid transfer labels", () => {
  it("recognizes transfers and card and loan payments, by primary or detailed code", () => {
    expect(hasPlaidTransferLabel({ plaidCategoryPrimary: "TRANSFER_IN", plaidCategoryDetailed: null })).toBe(true);
    expect(hasPlaidTransferLabel({ plaidCategoryPrimary: null, plaidCategoryDetailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT" })).toBe(true);
    expect(hasPlaidTransferLabel({ plaidCategoryPrimary: "FOOD_AND_DRINK", plaidCategoryDetailed: null })).toBe(false);
    expect(isLoanMovement({ plaidCategoryPrimary: "LOAN_PAYMENTS", plaidCategoryDetailed: null })).toBe(true);
    expect(isLoanMovement({ plaidCategoryPrimary: "TRANSFER_OUT", plaidCategoryDetailed: null })).toBe(false);
  });
});

describe("pairTransfers", () => {
  it("pairs opposite amounts in two accounts within five days", () => {
    const pairs = pairTransfers([
      leg("out", {}),
      leg("in", { originAccId: "savings", amount: -100, date: "2026-03-08", plaidCategoryPrimary: "TRANSFER_IN", plaidCategoryDetailed: null }),
    ]);
    expect(pairs.get("out")).toBe("in");
    expect(pairs.get("in")).toBe("out");
  });

  it("needs a transfer label on at least one leg", () => {
    const pairs = pairTransfers([
      leg("purchase", { plaidCategoryPrimary: "GENERAL_MERCHANDISE", plaidCategoryDetailed: null }),
      leg("refund", { originAccId: "card", amount: -100, plaidCategoryPrimary: "GENERAL_MERCHANDISE", plaidCategoryDetailed: null }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("skips the same account, other amounts, and gaps over five days", () => {
    const pairs = pairTransfers([
      leg("out", {}),
      leg("same-account", { amount: -100 }),
      leg("other-amount", { originAccId: "savings", amount: -99.99 }),
      leg("too-late", { originAccId: "savings", amount: -100, date: "2026-03-11" }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("skips income, expense, and hidden transactions", () => {
    const pairs = pairTransfers([
      leg("out", { categoryKind: "expense" }),
      leg("in", { originAccId: "savings", amount: -100 }),
      leg("hidden", { originAccId: "card", amount: -100, hidden: true }),
    ]);
    expect(pairs.size).toBe(0);
  });

  it("pairs a transfer category only with its destination", () => {
    const pairs = pairTransfers([
      leg("out", { categoryKind: "transfer", transferAccountId: "savings" }),
      leg("card", { originAccId: "card", amount: -100, date: "2026-03-05" }),
      leg("savings", { originAccId: "savings", amount: -100, date: "2026-03-07" }),
    ]);
    expect(pairs.get("out")).toBe("savings");
    expect(pairs.has("card")).toBe(false);
  });

  it("pairs each leg once, closest dates first", () => {
    const pairs = pairTransfers([
      leg("out", { date: "2026-03-05" }),
      leg("far", { originAccId: "savings", amount: -100, date: "2026-03-09" }),
      leg("near", { originAccId: "brokerage", amount: -100, date: "2026-03-06" }),
    ]);
    expect(pairs.get("out")).toBe("near");
    expect(pairs.has("far")).toBe(false);
  });
});
