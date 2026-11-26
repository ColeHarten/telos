import { describe, expect, it } from "vitest";
import {
  buildCategorizeContext,
  categorizeTransaction,
  draftRuleFor,
  emptyActions,
  emptyConditions,
  findRuleFor,
  merchantKey,
  nextMemory,
  parseMemory,
  parseRule,
  planAcceptSuggestions,
  planBulkCategory,
  planBulkHidden,
  planRuleApplication,
  ruleMatches,
  type CategorizeInput,
} from "@/lib/categorization";
import { normalizeMerchant } from "@/lib/merchant";
import { calculateWithholdings } from "@/lib/paycheck/paycheck";
import { isPlaidCategoryCode, plaidCategoryLabel } from "@/lib/plaidCategories";
import { STARTER_CATEGORIES, missingStarterCategories } from "@/lib/starterCategories";
import type { Category, Deduction, MerchantMemory, Rule, RuleConditions, Transaction } from "@/lib/types/types";

function category(overrides: Partial<Category>): Category {
  return { id: "c", name: "Category", kind: "expense", estimatedMonthly: 0, sortOrder: 0, isArchived: false, ...overrides };
}

const CATEGORIES: Category[] = [
  category({ id: "groceries", sortOrder: 1, plaidCategories: ["FOOD_AND_DRINK_GROCERIES"] }),
  category({ id: "dining", sortOrder: 2, plaidCategories: ["FOOD_AND_DRINK"] }),
  category({ id: "coffee", sortOrder: 3 }),
  category({ id: "retired", isArchived: true, plaidCategories: ["TRAVEL"] }),
  category({ id: "to-savings", kind: "transfer", transferAccountId: "savings" }),
];

function input(overrides: Partial<CategorizeInput> = {}): CategorizeInput {
  return {
    accountId: "checking",
    amount: 42.5,
    merchantName: "Whole Foods",
    merchantEntityId: null,
    rawName: "WHOLE FOODS #10 AUSTIN",
    originalDescription: "POS WHOLE FOODS MARKET #10 AUSTIN TX 4411",
    plaidPrimary: "FOOD_AND_DRINK",
    plaidDetailed: "FOOD_AND_DRINK_GROCERIES",
    plaidConfidence: "HIGH",
    ...overrides,
  };
}

function conditions(overrides: Partial<RuleConditions>): RuleConditions {
  return { ...emptyConditions(), ...overrides };
}

function rule(id: string, overrides: Partial<Rule> = {}): Rule {
  return {
    id,
    enabled: true,
    priority: 0,
    conditions: conditions({ merchant: { op: "is", value: "Whole Foods" } }),
    actions: { ...emptyActions(), categoryId: "dining" },
    ...overrides,
  };
}

function memory(key: string, categoryId: string, streak: number): MerchantMemory {
  return { key, label: key, categoryId, streak };
}

function context(rules: Rule[] = [], memories: MerchantMemory[] = [], categories = CATEGORIES) {
  return buildCategorizeContext(categories, rules, memories);
}

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t",
    originAccId: "checking",
    originAccName: "Checking",
    displayName: "Whole Foods",
    amount: 42.5,
    date: "2026-03-05",
    pending: false,
    plaidCategoryPrimary: "FOOD_AND_DRINK",
    plaidCategoryDetailed: "FOOD_AND_DRINK_GROCERIES",
    categoryKind: undefined,
    categoryId: undefined,
    transferAccountId: null,
    merchantName: "Whole Foods",
    rawName: "WHOLE FOODS #10 AUSTIN",
    ...overrides,
  };
}

describe("normalizeMerchant", () => {
  it("lowercases, strips punctuation, and collapses spaces", () => {
    expect(normalizeMerchant("  Starbucks #1234 ")).toBe("starbucks 1234");
    expect(normalizeMerchant("McDonald's")).toBe("mcdonalds");
    expect(normalizeMerchant("UBER   *TRIP")).toBe("uber trip");
  });
});

describe("merchantKey", () => {
  it("prefers Plaid's merchant id", () => {
    expect(merchantKey(input({ merchantEntityId: "abc/123" }))).toBe("m_abc-123");
  });

  it("drops digits so reference numbers don't split a merchant", () => {
    const first = merchantKey(input({ merchantName: null, rawName: "Zelle payment to John 81234" }));
    const second = merchantKey(input({ merchantName: null, rawName: "ZELLE PAYMENT TO JOHN 99120" }));
    expect(first).toBe("n_zelle-payment-to-john");
    expect(second).toBe(first);
  });

  it("returns null when nothing is left", () => {
    expect(merchantKey(input({ merchantName: null, rawName: "#1234" }))).toBeNull();
  });
});

describe("ruleMatches", () => {
  it("matches a merchant exactly, ignoring case, punctuation, and digits", () => {
    expect(ruleMatches(conditions({ merchant: { op: "is", value: "WHOLE FOODS" } }), input())).toBe(true);
    expect(ruleMatches(conditions({ merchant: { op: "is", value: "Whole" } }), input())).toBe(false);
    expect(ruleMatches(conditions({ merchant: { op: "contains", value: "whole" } }), input())).toBe(true);
  });

  it("falls back to the bank description when there is no merchant", () => {
    const zelle = input({ merchantName: null, rawName: "Zelle payment to John 5521" });
    expect(ruleMatches(conditions({ merchant: { op: "is", value: "Zelle payment to John 1200" } }), zelle)).toBe(true);
  });

  it("searches the description and original description", () => {
    expect(ruleMatches(conditions({ description: "market #10" }), input())).toBe(true);
    expect(ruleMatches(conditions({ description: "target" }), input())).toBe(false);
  });

  it("checks account, amount bounds, and direction", () => {
    expect(ruleMatches(conditions({ accountIds: ["checking"] }), input())).toBe(true);
    expect(ruleMatches(conditions({ accountIds: ["card"] }), input())).toBe(false);
    expect(ruleMatches(conditions({ amountMin: 40, amountMax: 42.5 }), input())).toBe(true);
    expect(ruleMatches(conditions({ amountMin: 50 }), input())).toBe(false);
    expect(ruleMatches(conditions({ amountMax: 10 }), input({ amount: -20 }))).toBe(false);
    expect(ruleMatches(conditions({ direction: "out" }), input())).toBe(true);
    expect(ruleMatches(conditions({ direction: "in" }), input())).toBe(false);
    expect(ruleMatches(conditions({ direction: "in" }), input({ amount: -20 }))).toBe(true);
  });

  it("needs every condition, and never matches with none", () => {
    expect(ruleMatches(conditions({ merchant: { op: "contains", value: "whole" }, direction: "in" }), input())).toBe(false);
    expect(ruleMatches(emptyConditions(), input())).toBe(false);
    expect(ruleMatches(conditions({ merchant: { op: "is", value: "1234" } }), input())).toBe(false);
  });
});

describe("categorizeTransaction", () => {
  it("applies the first matching rule by priority", () => {
    const result = categorizeTransaction(
      input(),
      context([rule("late", { priority: 5, actions: { ...emptyActions(), categoryId: "coffee" } }), rule("early", { priority: 1 })])
    );
    expect(result).toMatchObject({ categoryId: "dining", categorySource: "rule", ruleId: "early" });
  });

  it("skips disabled rules", () => {
    const result = categorizeTransaction(input(), context([rule("off", { enabled: false })]));
    expect(result.ruleId).toBeNull();
    expect(result.categorySource).toBe("plaid");
  });

  it("applies a rule's rename and hiding even when another step sets the category", () => {
    const renameOnly = rule("rename", { actions: { categoryId: null, rename: "Groceries run", hide: true } });
    const result = categorizeTransaction(input(), context([renameOnly]));
    expect(result).toMatchObject({
      categoryId: "groceries",
      categorySource: "plaid",
      ruleId: "rename",
      customName: "Groceries run",
      hidden: true,
    });
  });

  it("uses merchant memory after two matching picks", () => {
    const key = merchantKey(input()) ?? "";
    expect(categorizeTransaction(input(), context([], [memory(key, "coffee", 1)])).categorySource).toBe("plaid");
    expect(categorizeTransaction(input(), context([], [memory(key, "coffee", 2)]))).toMatchObject({
      categoryId: "coffee",
      categorySource: "merchant",
    });
  });

  it("prefers a detailed Plaid mapping over a primary one", () => {
    expect(categorizeTransaction(input(), context()).categoryId).toBe("groceries");
    expect(categorizeTransaction(input({ plaidDetailed: "FOOD_AND_DRINK_RESTAURANT" }), context()).categoryId).toBe("dining");
  });

  it("only suggests a less confident Plaid match", () => {
    const result = categorizeTransaction(input({ plaidConfidence: "MEDIUM" }), context());
    expect(result).toMatchObject({ categoryId: null, categorySource: null, suggestedCategoryId: "groceries" });
  });

  it("skips archived categories and self-transfers", () => {
    const archivedRule = rule("archived", { actions: { ...emptyActions(), categoryId: "retired" } });
    expect(categorizeTransaction(input(), context([archivedRule])).categorySource).toBe("plaid");
    expect(categorizeTransaction(input({ plaidPrimary: "TRAVEL", plaidDetailed: "TRAVEL_FLIGHTS" }), context()).categoryId).toBeNull();

    const toSavings = rule("savings", { actions: { ...emptyActions(), categoryId: "to-savings" } });
    expect(categorizeTransaction(input({ accountId: "savings" }), context([toSavings])).categoryId).toBe("groceries");
    expect(categorizeTransaction(input(), context([toSavings]))).toMatchObject({
      categoryKind: "transfer",
      categoryId: "to-savings",
      transferAccountId: "savings",
    });
  });

  it("leaves the transaction for review when nothing matches", () => {
    const result = categorizeTransaction(input({ plaidPrimary: "OTHER", plaidDetailed: "OTHER_OTHER" }), context());
    expect(result).toEqual({
      categoryKind: null,
      categoryId: null,
      transferAccountId: null,
      categorySource: null,
      ruleId: null,
      suggestedCategoryId: null,
      customName: null,
      hidden: false,
    });
  });
});

describe("planRuleApplication", () => {
  const byId = new Map(CATEGORIES.map((c) => [c.id, c]));
  const transactions = [
    tx({ id: "new" }),
    tx({ id: "auto", categoryKind: "expense", categoryId: "groceries", categorySource: "plaid" }),
    tx({ id: "mine", categoryKind: "expense", categoryId: "coffee", categorySource: "user" }),
    tx({ id: "done", categoryKind: "expense", categoryId: "dining", categorySource: "rule", ruleId: "r" }),
    tx({ id: "other", merchantName: "Target", rawName: "TARGET" }),
  ];

  it("changes automated categories and leaves your picks", () => {
    const result = planRuleApplication(rule("r"), transactions, byId, false);
    expect(result.matched).toBe(4);
    expect(result.userPicks).toBe(1);
    expect(result.updates.map((u) => u.id)).toEqual(["new", "auto"]);
    expect(result.updates[0].changes).toMatchObject({ categoryId: "dining", categorySource: "rule", ruleId: "r" });
  });

  it("includes your picks when asked", () => {
    const result = planRuleApplication(rule("r"), transactions, byId, true);
    expect(result.updates.map((u) => u.id)).toEqual(["new", "auto", "mine"]);
  });

  it("renames and hides every match", () => {
    const result = planRuleApplication(
      rule("r", { actions: { categoryId: null, rename: "WF", hide: true } }),
      transactions,
      byId,
      false
    );
    expect(result.updates).toHaveLength(4);
    expect(result.updates[2]).toEqual({ id: "mine", changes: { customName: "WF", hidden: true } });
  });
});

describe("suggestions and rule lookup", () => {
  const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

  it("accepts suggestions on uncategorized transactions only", () => {
    const updates = planAcceptSuggestions(
      [
        tx({ id: "a", suggestedCategoryId: "groceries" }),
        tx({ id: "b", suggestedCategoryId: "retired" }),
        tx({ id: "c", categoryKind: "expense", categoryId: "dining", suggestedCategoryId: "groceries" }),
      ],
      byId
    );
    expect(updates).toEqual([
      {
        id: "a",
        changes: {
          categoryKind: "expense",
          categoryId: "groceries",
          transferAccountId: null,
          categorySource: "user",
          suggestedCategoryId: null,
        },
      },
    ]);
  });

  it("finds an enabled rule that already gives a transaction a category", () => {
    expect(findRuleFor([rule("r")], tx({}), "dining")?.id).toBe("r");
    expect(findRuleFor([rule("r")], tx({}), "coffee")).toBeUndefined();
    expect(findRuleFor([rule("r", { enabled: false })], tx({}), "dining")).toBeUndefined();
  });
});

describe("bulk edits", () => {
  const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

  it("sets your category, skipping a transfer on its own account and existing picks", () => {
    const plan = planBulkCategory(
      [
        tx({ id: "a" }),
        tx({ id: "b", originAccId: "savings" }),
        tx({ id: "c", categoryKind: "transfer", categoryId: "to-savings", transferAccountId: "savings", categorySource: "user" }),
        tx({ id: "d", categoryKind: "transfer", categoryId: "to-savings", transferAccountId: "savings", categorySource: "rule" }),
      ],
      "to-savings",
      byId
    );
    expect(plan.skipped).toBe(1);
    expect(plan.updates.map((update) => update.id)).toEqual(["a", "d"]);
    expect(plan.updates[0].changes).toEqual({
      categoryKind: "transfer",
      categoryId: "to-savings",
      transferAccountId: "savings",
      categorySource: "user",
      suggestedCategoryId: null,
    });
  });

  it("refuses archived and missing categories", () => {
    expect(planBulkCategory([tx({})], "retired", byId)).toEqual({ updates: [], skipped: 1 });
    expect(planBulkCategory([tx({})], "nope", byId)).toEqual({ updates: [], skipped: 1 });
  });

  it("hides or shows only what needs it", () => {
    const txs = [tx({ id: "a" }), tx({ id: "b", hidden: true })];
    expect(planBulkHidden(txs, true)).toEqual([{ id: "a", changes: { hidden: true } }]);
    expect(planBulkHidden(txs, false)).toEqual([{ id: "b", changes: { hidden: false } }]);
  });

  it("drafts a rule from a shared merchant and category", () => {
    const draft = draftRuleFor([
      tx({ id: "a", categoryKind: "expense", categoryId: "dining" }),
      tx({ id: "b", rawName: "WHOLE FOODS #22 DALLAS", categoryKind: "expense", categoryId: "dining" }),
    ]);
    expect(draft.conditions.merchant).toEqual({ op: "is", value: "Whole Foods" });
    expect(draft.actions.categoryId).toBe("dining");
  });

  it("leaves out what the selection doesn't share", () => {
    const draft = draftRuleFor([
      tx({ id: "a" }),
      tx({ id: "b", merchantName: "Costco", categoryKind: "expense", categoryId: "dining" }),
    ]);
    expect(draft.conditions.merchant).toBeNull();
    expect(draft.actions.categoryId).toBeNull();
    expect(draftRuleFor([])).toEqual({ conditions: emptyConditions(), actions: emptyActions() });
  });
});

describe("stored docs", () => {
  it("parses a rule and drops one that can't run", () => {
    const parsed = parseRule("r1", {
      enabled: true,
      priority: 3,
      conditions: { merchant: { op: "is", value: " Whole Foods " }, amountMin: -5, accountIds: ["a", 7] },
      actions: { categoryId: "dining", rename: "", hide: "yes" },
    });
    expect(parsed).toEqual({
      id: "r1",
      enabled: true,
      priority: 3,
      conditions: { ...emptyConditions(), merchant: { op: "is", value: "Whole Foods" }, accountIds: ["a"] },
      actions: { categoryId: "dining", rename: null, hide: false },
    });
    expect(parseRule("r2", { conditions: {}, actions: { categoryId: "dining" } })).toBeNull();
    expect(parseRule("r3", { conditions: { description: "x" }, actions: {} })).toBeNull();
  });

  it("counts a merchant's streak and resets it on a different category", () => {
    const first = nextMemory(null, "n_cafe", "Cafe", "coffee");
    const second = nextMemory(first, "n_cafe", "Cafe", "coffee");
    expect(second.streak).toBe(2);
    expect(nextMemory(second, "n_cafe", "Cafe", "dining")).toMatchObject({ categoryId: "dining", streak: 1 });
    expect(parseMemory("n_cafe", { categoryId: "coffee", streak: 0 })).toBeNull();
  });
});

describe("starter categories", () => {
  it("use real Plaid codes, each mapped once", () => {
    const codes = STARTER_CATEGORIES.flatMap((starter) => starter.plaidCategories);
    expect(codes.every(isPlaidCategoryCode)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(plaidCategoryLabel("FOOD_AND_DRINK_GROCERIES")).toBe("Food and drink › Groceries");
  });

  it("skip names you already have", () => {
    const missing = missingStarterCategories(["groceries", "Rent "]);
    expect(missing.some((starter) => starter.name === "Groceries" || starter.name === "Rent")).toBe(false);
    expect(missing).toHaveLength(STARTER_CATEGORIES.length - 2);
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
