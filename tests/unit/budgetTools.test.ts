import { describe, expect, it } from "vitest";
import { copyLines, estimateLines, type BudgetSlot } from "@/lib/budgetTools";
import type { BudgetLines } from "@/lib/types/types";

const SLOTS: BudgetSlot[] = [
  { id: "category_salary", lineType: "income", categoryId: "salary", fallback: 5000 },
  { id: "category_food", lineType: "expense", categoryId: "food", fallback: 400 },
  { id: "category_fun", lineType: "expense", categoryId: "fun", fallback: 150.125 },
  { id: "account_savings", lineType: "transfer", categoryId: "savings", fallback: 0 },
];

describe("copyLines", () => {
  it("copies what last month showed, including estimates for lines it never set", () => {
    const lastMonth: BudgetLines = {
      category_food: { id: "category_food", lineType: "expense", categoryId: "food", planned: 520 },
      account_savings: { id: "account_savings", lineType: "transfer", categoryId: "savings", planned: 300 },
      // A line for a category that no longer has one is ignored.
      category_gone: { id: "category_gone", lineType: "expense", categoryId: "gone", planned: 99 },
    };
    expect(copyLines(lastMonth, SLOTS)).toEqual([
      { id: "category_salary", lineType: "income", categoryId: "salary", planned: 5000 },
      { id: "category_food", lineType: "expense", categoryId: "food", planned: 520 },
      { id: "category_fun", lineType: "expense", categoryId: "fun", planned: 150.13 },
      { id: "account_savings", lineType: "transfer", categoryId: "savings", planned: 300 },
    ]);
  });

  it("treats a broken amount as zero", () => {
    const lastMonth = {
      category_food: { id: "category_food", lineType: "expense", categoryId: "food", planned: Number.NaN },
    } as BudgetLines;
    expect(copyLines(lastMonth, SLOTS.slice(1, 2))[0].planned).toBe(0);
  });
});

describe("estimateLines", () => {
  it("sets income and expense lines to their estimates and leaves accounts alone", () => {
    expect(estimateLines(SLOTS)).toEqual([
      { id: "category_salary", lineType: "income", categoryId: "salary", planned: 5000 },
      { id: "category_food", lineType: "expense", categoryId: "food", planned: 400 },
      { id: "category_fun", lineType: "expense", categoryId: "fun", planned: 150.13 },
    ]);
  });
});
