import { formatCurrency } from "@/lib/utils";
import type { Account, Category, Rule } from "@/lib/types/types";

/** "Merchant is Starbucks, from Checking, $5 to $20, money out" */
export function describeConditions(rule: Pick<Rule, "conditions">, accountsById: ReadonlyMap<string, Account>): string {
  const c = rule.conditions;
  const parts: string[] = [];
  if (c.merchant) parts.push(`Merchant ${c.merchant.op === "is" ? "is" : "contains"} "${c.merchant.value}"`);
  if (c.description) parts.push(`description contains "${c.description}"`);
  if (c.accountIds.length > 0) {
    const names = c.accountIds.map((id) => accountsById.get(id)?.name ?? "a removed account");
    parts.push(`in ${names.join(" or ")}`);
  }
  if (c.amountMin !== null && c.amountMax !== null) {
    parts.push(`${formatCurrency(c.amountMin)} to ${formatCurrency(c.amountMax)}`);
  } else if (c.amountMin !== null) {
    parts.push(`at least ${formatCurrency(c.amountMin)}`);
  } else if (c.amountMax !== null) {
    parts.push(`at most ${formatCurrency(c.amountMax)}`);
  }
  if (c.direction) parts.push(c.direction === "in" ? "money in" : "money out");
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Dining, rename to Coffee, hide" */
export function describeActions(rule: Pick<Rule, "actions">, categoriesById: ReadonlyMap<string, Category>): string {
  const a = rule.actions;
  const parts: string[] = [];
  if (a.categoryId) {
    const category = categoriesById.get(a.categoryId);
    parts.push(category ? `${category.name}${category.isArchived ? " (archived)" : ""}` : "a deleted category");
  }
  if (a.rename) parts.push(`rename to "${a.rename}"`);
  if (a.hide) parts.push("hide from budgets");
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
