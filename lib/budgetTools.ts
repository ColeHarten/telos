import type { BudgetLine, BudgetLines, CategoryKind } from "@/lib/types/types";

/**
 * Budget shortcuts: Copy last month and Fill from estimates. Pure; the Budgets
 * page saves the lines they return.
 */

/** A line on the Budgets page and what it shows when it was never set. */
export type BudgetSlot = {
  id: string;
  lineType: CategoryKind;
  /** The category (or, for savings and debt, the account) the line is for. */
  categoryId: string;
  /** The category's monthly estimate, or 0 for accounts. */
  fallback: number;
};

function toAmount(value: unknown, fallback: number): number {
  const n = Number(value);
  return Math.round((Number.isFinite(n) ? n : fallback) * 100) / 100;
}

/**
 * Last month's amounts for this month's lines, as last month showed them: a
 * line it never set shows the category's estimate (or 0 for an account).
 */
export function copyLines(from: BudgetLines, slots: readonly BudgetSlot[]): BudgetLine[] {
  return slots.map((slot) => {
    const line = from[slot.id];
    return {
      id: slot.id,
      lineType: slot.lineType,
      categoryId: slot.categoryId,
      planned: line ? toAmount(line.planned, 0) : toAmount(slot.fallback, 0),
    };
  });
}

/** Each income and expense line set to its category's monthly estimate. Savings and debt lines are left alone. */
export function estimateLines(slots: readonly BudgetSlot[]): BudgetLine[] {
  return slots
    .filter((slot) => slot.lineType === "income" || slot.lineType === "expense")
    .map((slot) => ({ id: slot.id, lineType: slot.lineType, categoryId: slot.categoryId, planned: toAmount(slot.fallback, 0) }));
}
