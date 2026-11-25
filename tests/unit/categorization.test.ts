import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "@/lib/merchant";
import { calculateWithholdings } from "@/lib/paycheck/paycheck";
import { applyRules, readVotes, resolveWinner, type RulesContext } from "@/lib/services/ruleEngine";
import type { Category, Deduction } from "@/lib/types/types";

describe("normalizeMerchant", () => {
  it("lowercases, strips punctuation, and collapses spaces", () => {
    expect(normalizeMerchant("  Starbucks #1234 ")).toBe("starbucks 1234");
    expect(normalizeMerchant("McDonald's")).toBe("mcdonalds");
    expect(normalizeMerchant("UBER   *TRIP")).toBe("uber trip");
  });
});

describe("resolveWinner", () => {
  it("needs at least three votes", () => {
    expect(resolveWinner({})).toBeNull();
    expect(resolveWinner({ food: 2 })).toBeNull();
    expect(resolveWinner({ food: 3 })).toBe("food");
  });

  it("needs a lead of at least two over the runner-up", () => {
    expect(resolveWinner({ food: 4, dining: 3 })).toBeNull();
    expect(resolveWinner({ food: 5, dining: 3 })).toBe("food");
  });
});

describe("readVotes", () => {
  it("reads nested counts and legacy literal fields together", () => {
    expect(readVotes({ counts: { food: 2 }, "counts.food": 1, "counts.dining": 4 })).toEqual({ food: 3, dining: 4 });
  });
});

function category(overrides: Partial<Category>): Category {
  return { id: "c", name: "Category", kind: "expense", estimatedMonthly: 0, sortOrder: 0, isArchived: false, ...overrides };
}

const baseTransaction = {
  merchantName: "Whole Foods",
  rawName: "WHOLE FOODS #10",
  category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_GROCERIES", confidence_level: "HIGH" },
  categoryKind: null,
  categoryId: null,
  transferAccountId: null,
};

function context(overrides: Partial<RulesContext>): RulesContext {
  return {
    categories: [
      category({ id: "groceries" }),
      category({ id: "dining" }),
      category({ id: "retired", isArchived: true }),
      category({ id: "to-savings", kind: "transfer", transferAccountId: "savings" }),
    ],
    automations: new Map(),
    plaidCategoryDefaults: new Map(),
    ...overrides,
  };
}

describe("applyRules", () => {
  it("applies an automation first", () => {
    const result = applyRules(
      baseTransaction,
      context({
        automations: new Map([["whole foods", "dining"]]),
        plaidCategoryDefaults: new Map([["FOOD_AND_DRINK_GROCERIES", "groceries"]]),
      })
    );
    expect(result.categoryId).toBe("dining");
    expect(result.categoryKind).toBe("expense");
  });

  it("falls through to the learned default when the automation's category is archived", () => {
    const result = applyRules(
      baseTransaction,
      context({
        automations: new Map([["whole foods", "retired"]]),
        plaidCategoryDefaults: new Map([["FOOD_AND_DRINK_GROCERIES", "groceries"]]),
      })
    );
    expect(result.categoryId).toBe("groceries");
  });

  it("sets the destination account for a transfer category", () => {
    const result = applyRules(baseTransaction, context({ automations: new Map([["whole foods", "to-savings"]]) }));
    expect(result).toMatchObject({ categoryKind: "transfer", categoryId: "to-savings", transferAccountId: "savings" });
  });

  it("leaves the transaction uncategorized when nothing matches", () => {
    const result = applyRules(baseTransaction, context({}));
    expect(result).toMatchObject({ categoryKind: null, categoryId: null, transferAccountId: null });
  });
});

describe("calculateWithholdings", () => {
  const deductions: Deduction[] = [
    { id: "tax", label: "Federal", value: 20, kind: "percentOfGross", type: "tax" },
    { id: "401k", label: "401(k)", value: 10, kind: "percentOfGross", type: "preTaxDeduction", linkedAccountId: "retirement" },
    { id: "gym", label: "Gym", value: 50, kind: "flatAmount", type: "postTaxDeduction" },
  ];

  it("computes net pay and monthly figures", () => {
    const result = calculateWithholdings(2000, deductions, "biweekly");
    expect(result.totalWithheld).toBe(650);
    expect(result.netPay).toBe(1350);
    expect(result.estimatedMonthlyNet).toBeCloseTo(2925);
  });

  it("lists only linked, non-tax deductions as transfers", () => {
    const { deductionBreakdown } = calculateWithholdings(2000, deductions, "biweekly");
    expect(deductionBreakdown).toHaveLength(1);
    expect(deductionBreakdown[0].deductionId).toBe("401k");
    expect(deductionBreakdown[0].monthlyAmount).toBeCloseTo(433.33, 2);
  });

  it("never returns negative net pay", () => {
    const result = calculateWithholdings(100, [{ id: "x", label: "X", value: 150, kind: "flatAmount", type: "tax" }], "monthly");
    expect(result.netPay).toBe(0);
  });
});
