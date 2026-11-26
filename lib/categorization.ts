import { normalizeMerchant } from "@/lib/merchant";
import type {
  Category,
  CategoryKind,
  CategorySource,
  MerchantMemory,
  Rule,
  RuleActions,
  RuleConditions,
  Transaction,
} from "@/lib/types/types";

/**
 * The categorization engine, shared by the sync job (new transactions) and
 * the browser (rule previews, Apply to past, and suggestions). Pure: no I/O,
 * so it is unit tested.
 *
 * Order, first match wins:
 *   1. Your rules, by priority. Only the first matching rule applies.
 *   2. Merchant memory: a merchant you put in the same category twice in a row.
 *   3. The Plaid mappings on your categories. A confident match assigns the
 *      category; a less confident one is only suggested in Needs Review.
 *   4. Nothing: the transaction waits in Needs Review.
 *
 * A category is skipped (and the next step tried) when it is archived,
 * deleted, or a transfer to the transaction's own account.
 */

export const CUSTOM_NAME_MAX = 120;
export const NOTES_MAX = 1000;
/** Merchant memory applies once you've chosen the same category this many times in a row. */
export const MEMORY_MIN_STREAK = 2;

export const CATEGORY_SOURCES: readonly CategorySource[] = ["user", "rule", "merchant", "plaid"];

export type CategorizeInput = {
  accountId: string;
  /** Plaid's sign: positive is money out. */
  amount: number;
  merchantName: string | null;
  merchantEntityId: string | null;
  rawName: string;
  originalDescription: string | null;
  plaidPrimary: string | null;
  plaidDetailed: string | null;
  plaidConfidence: string | null;
};

export type Assignment = {
  categoryKind: CategoryKind | null;
  categoryId: string | null;
  transferAccountId: string | null;
};

export type CategorizeResult = Assignment & {
  categorySource: CategorySource | null;
  /** The first rule that matched, whether or not it set the category. */
  ruleId: string | null;
  /** A less confident Plaid match, shown in Needs Review for you to accept. */
  suggestedCategoryId: string | null;
  customName: string | null;
  hidden: boolean;
};

export type CategorizeContext = {
  categoriesById: ReadonlyMap<string, Category>;
  /** Enabled rules in priority order. */
  rules: readonly Rule[];
  memory: ReadonlyMap<string, MerchantMemory>;
  /** A Plaid code (primary or detailed) to the category it maps to. */
  plaidMap: ReadonlyMap<string, Category>;
};

const UNASSIGNED: CategorizeResult = {
  categoryKind: null,
  categoryId: null,
  transferAccountId: null,
  categorySource: null,
  ruleId: null,
  suggestedCategoryId: null,
  customName: null,
  hidden: false,
};

// ------------------------------------------------------------ context

/** Rules in the order they run: lowest priority number first. */
export function sortRules<T extends Pick<Rule, "id" | "priority">>(rules: readonly T[]): T[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function buildCategorizeContext(
  categories: readonly Category[],
  rules: readonly Rule[],
  memory: readonly MerchantMemory[]
): CategorizeContext {
  const plaidMap = new Map<string, Category>();
  // When two categories map the same code, the one listed first wins.
  const ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  for (const category of ordered) {
    if (category.isArchived) continue;
    for (const code of category.plaidCategories ?? []) {
      if (!plaidMap.has(code)) plaidMap.set(code, category);
    }
  }
  return {
    categoriesById: new Map(categories.map((category) => [category.id, category])),
    rules: sortRules(rules.filter((rule) => rule.enabled)),
    memory: new Map(memory.map((entry) => [entry.key, entry])),
    plaidMap,
  };
}

/** The category to assign, or null when it is missing, archived, or a transfer to the same account. */
export function usableCategory(
  categoriesById: ReadonlyMap<string, Category>,
  categoryId: string | null | undefined,
  accountId: string
): Category | null {
  if (!categoryId) return null;
  const category = categoriesById.get(categoryId);
  if (!category || category.isArchived) return null;
  if (category.kind === "transfer" && (!category.transferAccountId || category.transferAccountId === accountId)) {
    return null;
  }
  return category;
}

export function assignmentFor(category: Category): Assignment {
  return {
    categoryKind: category.kind,
    categoryId: category.id,
    transferAccountId: category.kind === "transfer" ? category.transferAccountId ?? null : null,
  };
}

// ------------------------------------------------------------ matching

/** Lowercase, no punctuation, and no digits, so store numbers and reference codes don't matter. */
export function matchText(value: string): string {
  return normalizeMerchant(value).replace(/[0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The merchant memory key: Plaid's merchant id when it has one, otherwise
 * the merchant name without digits. Also the memory doc's id.
 */
export function merchantKey(input: Pick<CategorizeInput, "merchantEntityId" | "merchantName" | "rawName">): string | null {
  if (input.merchantEntityId) return `m_${input.merchantEntityId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 100)}`;
  const name = matchText(input.merchantName || input.rawName).replace(/ /g, "-").slice(0, 100);
  return name ? `n_${name}` : null;
}

function collapse(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when every condition set on the rule holds. A rule with no conditions never matches. */
export function ruleMatches(conditions: RuleConditions, input: CategorizeInput): boolean {
  let tested = false;

  if (conditions.merchant) {
    tested = true;
    const wanted = matchText(conditions.merchant.value);
    const name = matchText(input.merchantName || input.rawName);
    if (!wanted) return false;
    if (conditions.merchant.op === "is" ? name !== wanted : !name.includes(wanted)) return false;
  }

  if (conditions.description) {
    tested = true;
    const wanted = collapse(conditions.description);
    const haystack = collapse(`${input.rawName} ${input.originalDescription ?? ""}`);
    if (!wanted || !haystack.includes(wanted)) return false;
  }

  if (conditions.accountIds.length > 0) {
    tested = true;
    if (!conditions.accountIds.includes(input.accountId)) return false;
  }

  const size = Math.abs(input.amount);
  if (conditions.amountMin !== null) {
    tested = true;
    if (size < conditions.amountMin) return false;
  }
  if (conditions.amountMax !== null) {
    tested = true;
    if (size > conditions.amountMax) return false;
  }

  if (conditions.direction) {
    tested = true;
    if (conditions.direction === "in" ? input.amount >= 0 : input.amount <= 0) return false;
  }

  return tested;
}

function isConfident(confidence: string | null): boolean {
  return confidence === "HIGH" || confidence === "VERY_HIGH";
}

function plaidCategoryFor(ctx: CategorizeContext, input: CategorizeInput): Category | null {
  for (const code of [input.plaidDetailed, input.plaidPrimary]) {
    if (!code) continue;
    const mapped = ctx.plaidMap.get(code);
    const category = mapped ? usableCategory(ctx.categoriesById, mapped.id, input.accountId) : null;
    if (category) return category;
  }
  return null;
}

// ------------------------------------------------------------ the engine

export function categorizeTransaction(input: CategorizeInput, ctx: CategorizeContext): CategorizeResult {
  const rule = ctx.rules.find((candidate) => ruleMatches(candidate.conditions, input));
  const base: CategorizeResult = {
    ...UNASSIGNED,
    ruleId: rule?.id ?? null,
    customName: rule?.actions.rename ?? null,
    hidden: rule?.actions.hide ?? false,
  };

  const ruleCategory = rule ? usableCategory(ctx.categoriesById, rule.actions.categoryId, input.accountId) : null;
  if (ruleCategory) return { ...base, ...assignmentFor(ruleCategory), categorySource: "rule" };

  const key = merchantKey(input);
  const remembered = key ? ctx.memory.get(key) : undefined;
  if (remembered && remembered.streak >= MEMORY_MIN_STREAK) {
    const category = usableCategory(ctx.categoriesById, remembered.categoryId, input.accountId);
    if (category) return { ...base, ...assignmentFor(category), categorySource: "merchant" };
  }

  const mapped = plaidCategoryFor(ctx, input);
  if (mapped && isConfident(input.plaidConfidence)) return { ...base, ...assignmentFor(mapped), categorySource: "plaid" };
  return { ...base, suggestedCategoryId: mapped?.id ?? null };
}

// ------------------------------------------------------------ browser helpers

/** The engine's view of a transaction loaded in the browser. */
export function transactionInput(tx: Omit<Transaction, "originAccName">): CategorizeInput {
  return {
    accountId: tx.originAccId,
    amount: tx.amount,
    merchantName: tx.merchantName ?? null,
    merchantEntityId: tx.merchantEntityId ?? null,
    rawName: tx.rawName ?? tx.displayName,
    originalDescription: tx.originalDescription ?? null,
    plaidPrimary: tx.plaidCategoryPrimary,
    plaidDetailed: tx.plaidCategoryDetailed,
    plaidConfidence: tx.plaidConfidence ?? null,
  };
}

/** A category you chose yourself. Automation never changes these unless you ask it to. */
export function isUserPick(tx: Pick<Transaction, "categoryId" | "categorySource">): boolean {
  return Boolean(tx.categoryId) && (tx.categorySource ?? "user") === "user";
}

/** Fields the browser may write on a transaction, besides updatedAt. */
export type TransactionChanges = Partial<
  Assignment & {
    categorySource: CategorySource | null;
    ruleId: string | null;
    suggestedCategoryId: string | null;
    customName: string | null;
    hidden: boolean;
    notes: string | null;
  }
>;

export type TransactionUpdate = { id: string; changes: TransactionChanges };

export type RuleApplication = {
  matched: number;
  /** Matches whose category you chose yourself. */
  userPicks: number;
  updates: TransactionUpdate[];
};

/**
 * What applying a rule to loaded transactions would change. Your own
 * category picks keep their category unless includeUserPicks is set; renames
 * and hiding apply to every match.
 */
export function planRuleApplication(
  rule: Pick<Rule, "id" | "conditions" | "actions">,
  transactions: readonly Transaction[],
  categoriesById: ReadonlyMap<string, Category>,
  includeUserPicks: boolean
): RuleApplication {
  let matched = 0;
  let userPicks = 0;
  const updates: TransactionUpdate[] = [];

  for (const tx of transactions) {
    if (!ruleMatches(rule.conditions, transactionInput(tx))) continue;
    matched += 1;
    const pick = isUserPick(tx);
    if (pick) userPicks += 1;

    let changes: TransactionChanges = {};
    const category = usableCategory(categoriesById, rule.actions.categoryId, tx.originAccId);
    if (category && (!pick || includeUserPicks)) {
      const same = tx.categoryId === category.id && tx.categorySource === "rule" && tx.ruleId === rule.id;
      if (!same) {
        changes = { ...assignmentFor(category), categorySource: "rule", ruleId: rule.id, suggestedCategoryId: null };
      }
    }
    if (rule.actions.rename && tx.customName !== rule.actions.rename) changes.customName = rule.actions.rename;
    if (rule.actions.hide && !tx.hidden) changes.hidden = true;
    if (Object.keys(changes).length > 0) updates.push({ id: tx.id, changes });
  }

  return { matched, userPicks, updates };
}

/** Accepts Plaid's suggestion on each uncategorized transaction that has one. */
export function planAcceptSuggestions(
  transactions: readonly Transaction[],
  categoriesById: ReadonlyMap<string, Category>
): TransactionUpdate[] {
  const updates: TransactionUpdate[] = [];
  for (const tx of transactions) {
    if (tx.categoryId || !tx.suggestedCategoryId) continue;
    const category = usableCategory(categoriesById, tx.suggestedCategoryId, tx.originAccId);
    if (!category) continue;
    updates.push({
      id: tx.id,
      changes: { ...assignmentFor(category), categorySource: "user", suggestedCategoryId: null },
    });
  }
  return updates;
}

/** The rule whose conditions match a transaction and that already gives it this category. */
export function findRuleFor(
  rules: readonly Rule[],
  tx: Transaction,
  categoryId: string
): Rule | undefined {
  const input = transactionInput(tx);
  return sortRules(rules.filter((rule) => rule.enabled)).find(
    (rule) => rule.actions.categoryId === categoryId && ruleMatches(rule.conditions, input)
  );
}

// ------------------------------------------------------------ parsing stored docs

function text(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function emptyConditions(): RuleConditions {
  return { merchant: null, description: null, accountIds: [], amountMin: null, amountMax: null, direction: null };
}

export function emptyActions(): RuleActions {
  return { categoryId: null, rename: null, hide: false };
}

export function hasCondition(conditions: RuleConditions): boolean {
  return Boolean(
    conditions.merchant ||
      conditions.description ||
      conditions.accountIds.length > 0 ||
      conditions.amountMin !== null ||
      conditions.amountMax !== null ||
      conditions.direction
  );
}

export function hasAction(actions: RuleActions): boolean {
  return Boolean(actions.categoryId || actions.rename || actions.hide);
}

/** A rule doc as stored, or null when it can't run (no conditions or no actions). */
export function parseRule(id: string, data: unknown): Rule | null {
  const doc = record(data);
  const c = record(doc.conditions);
  const a = record(doc.actions);
  const merchant = record(c.merchant);
  const merchantValue = text(merchant.value);

  const conditions: RuleConditions = {
    merchant: merchantValue ? { op: merchant.op === "is" ? "is" : "contains", value: merchantValue } : null,
    description: text(c.description),
    accountIds: Array.isArray(c.accountIds) ? c.accountIds.filter((v): v is string => typeof v === "string") : [],
    amountMin: amount(c.amountMin),
    amountMax: amount(c.amountMax),
    direction: c.direction === "in" || c.direction === "out" ? c.direction : null,
  };
  const actions: RuleActions = {
    categoryId: text(a.categoryId),
    rename: text(a.rename, CUSTOM_NAME_MAX),
    hide: a.hide === true,
  };
  if (!hasCondition(conditions) || !hasAction(actions)) return null;

  return {
    id,
    enabled: doc.enabled !== false,
    priority: typeof doc.priority === "number" && Number.isFinite(doc.priority) ? doc.priority : 0,
    conditions,
    actions,
  };
}

export function parseMemory(id: string, data: unknown): MerchantMemory | null {
  const doc = record(data);
  const categoryId = text(doc.categoryId);
  const streak = typeof doc.streak === "number" && Number.isFinite(doc.streak) ? doc.streak : 0;
  if (!categoryId || streak <= 0) return null;
  return { key: id, label: text(doc.label) ?? "", categoryId, streak };
}

/** The memory doc after you put a merchant's transaction in a category. */
export function nextMemory(current: MerchantMemory | null, key: string, label: string, categoryId: string): MerchantMemory {
  const streak = current && current.categoryId === categoryId ? current.streak + 1 : 1;
  return { key, label: label.slice(0, 200), categoryId, streak };
}

// ------------------------------------------------------------ bulk edits

export type BulkPlan = { updates: TransactionUpdate[]; skipped: number };

/**
 * Your category on every selected transaction. Transactions it can't apply to
 * (a transfer category on its own account) are skipped and counted; ones
 * already on it as your pick are left alone.
 */
export function planBulkCategory(
  transactions: readonly Transaction[],
  categoryId: string,
  categoriesById: ReadonlyMap<string, Category>
): BulkPlan {
  const updates: TransactionUpdate[] = [];
  let skipped = 0;
  for (const tx of transactions) {
    const category = usableCategory(categoriesById, categoryId, tx.originAccId);
    if (!category) {
      skipped += 1;
      continue;
    }
    if (tx.categoryId === category.id && isUserPick(tx)) continue;
    updates.push({
      id: tx.id,
      changes: { ...assignmentFor(category), categorySource: "user", suggestedCategoryId: null },
    });
  }
  return { updates, skipped };
}

/** Hides or shows the selected transactions, skipping ones already that way. */
export function planBulkHidden(transactions: readonly Transaction[], hidden: boolean): TransactionUpdate[] {
  return transactions
    .filter((tx) => Boolean(tx.hidden) !== hidden)
    .map((tx) => ({ id: tx.id, changes: { hidden } }));
}

/**
 * A starting point for a rule from selected transactions: "merchant is X"
 * when they share a merchant, and their category when they share one.
 */
export function draftRuleFor(transactions: readonly Transaction[]): { conditions: RuleConditions; actions: RuleActions } {
  const conditions = emptyConditions();
  const actions = emptyActions();
  const first = transactions[0];
  if (!first) return { conditions, actions };

  const name = (first.merchantName || first.rawName || first.displayName).trim();
  const key = matchText(name);
  if (key && transactions.every((tx) => matchText(tx.merchantName || tx.rawName || tx.displayName) === key)) {
    conditions.merchant = { op: "is", value: name };
  }
  if (first.categoryId && transactions.every((tx) => tx.categoryId === first.categoryId)) {
    actions.categoryId = first.categoryId;
  }
  return { conditions, actions };
}
