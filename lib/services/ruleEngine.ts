import "server-only";

import { buildCategorizeContext, parseMemory, parseRule, type CategorizeContext } from "@/lib/categorization";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { Category, CategoryKind, MerchantMemory, Rule } from "@/lib/types/types";

const KINDS: readonly CategoryKind[] = ["income", "expense", "transfer"];

function toCategory(id: string, data: Record<string, unknown>): Category {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    kind: KINDS.find((kind) => kind === data.kind) ?? "expense",
    estimatedMonthly: Number(data.estimatedMonthly ?? 0) || 0,
    sortOrder: Number(data.sortOrder ?? 0) || 0,
    isArchived: data.isArchived === true,
    transferAccountId: typeof data.transferAccountId === "string" ? data.transferAccountId : null,
    plaidCategories: Array.isArray(data.plaidCategories)
      ? data.plaidCategories.filter((code): code is string => typeof code === "string")
      : [],
  };
}

/**
 * Reads what the categorization engine needs for one user: categories,
 * rules, and merchant memory. Once per sync, not once per transaction.
 * Malformed rules and memory docs are skipped.
 */
export async function buildRulesContext(uid: string): Promise<CategorizeContext> {
  const user = getAdminDb().collection("users").doc(uid);
  const [categoriesSnap, rulesSnap, memorySnap] = await Promise.all([
    user.collection("categories").get(),
    user.collection("rules").get(),
    user.collection("merchantMemory").get(),
  ]);

  const categories = categoriesSnap.docs.map((d) => toCategory(d.id, d.data()));
  const rules: Rule[] = [];
  for (const d of rulesSnap.docs) {
    const rule = parseRule(d.id, d.data());
    if (rule) rules.push(rule);
  }
  const memory: MerchantMemory[] = [];
  for (const d of memorySnap.docs) {
    const entry = parseMemory(d.id, d.data());
    if (entry) memory.push(entry);
  }
  return buildCategorizeContext(categories, rules, memory);
}
