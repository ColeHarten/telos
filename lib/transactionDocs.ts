import type { PersonalFinanceCategory } from "plaid";
import { CATEGORY_SOURCES } from "@/lib/categorization";
import type { CategoryKind, CategorySource, Transaction } from "@/lib/types/types";

/** A transaction doc as the browser reads it, before the account name is joined in. */
export type RawTransaction = Omit<Transaction, "originAccName">;

export type TransactionDocData = {
  accountId?: string;
  amount?: number;
  date?: string;
  merchantName?: string | null;
  merchantEntityId?: string | null;
  rawName?: string;
  originalDescription?: string | null;
  logoUrl?: string | null;
  pending?: boolean;
  category?: PersonalFinanceCategory | null;
  categoryKind?: CategoryKind | null;
  categoryId?: string | null;
  transferAccountId?: string | null;
  categorySource?: string | null;
  ruleId?: string | null;
  suggestedCategoryId?: string | null;
  customName?: string | null;
  hidden?: boolean;
  notes?: string | null;
  authorizedDate?: string | null;
  website?: string | null;
  /** Set by the sync job when Plaid removed the transaction; the doc is deleted shortly after. */
  removedByPlaid?: boolean;
};

/**
 * Reconciles the raw assignment fields read from Firestore into a valid
 * (categoryKind, categoryId) pair. An inconsistent record is logged and shown
 * as unassigned rather than breaking the whole list.
 */
export function normalizeAssignment(
  rawType: unknown,
  rawId: unknown,
  context: string
): { categoryKind: CategoryKind | undefined; categoryId: string | undefined } {
  const categoryKind = (typeof rawType === "string" ? rawType : undefined) as CategoryKind | undefined;
  const categoryId = typeof rawId === "string" && rawId.length > 0 ? rawId : undefined;

  const hasId = Boolean(categoryId);
  const isConsistent = (!categoryKind && !hasId) || (!!categoryKind && hasId);

  if (!isConsistent) {
    console.warn(
      `[transactions] Inconsistent assignment for ${context}: type="${categoryKind}", id="${categoryId ?? "none"}". Falling back to unassigned.`
    );
    return { categoryKind: undefined, categoryId: undefined };
  }

  return { categoryKind, categoryId };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toSource(value: unknown): CategorySource | null {
  return CATEGORY_SOURCES.find((source) => source === value) ?? null;
}

export function toTransaction(id: string, data: TransactionDocData): RawTransaction {
  const { categoryKind, categoryId } = normalizeAssignment(data.categoryKind, data.categoryId, `transaction ${id}`);
  const customName = nonEmpty(data.customName);
  const merchantName = nonEmpty(data.merchantName);
  const rawName = data.rawName ?? "";

  return {
    id,
    originAccId: data.accountId || "unlinked",
    displayName: customName ?? merchantName ?? rawName,
    amount: data.amount ?? 0,
    date: data.date ?? "",
    pending: Boolean(data.pending),
    plaidCategoryPrimary: data.category?.primary ?? null,
    plaidCategoryDetailed: data.category?.detailed ?? null,
    plaidConfidence: data.category?.confidence_level ?? null,
    categoryKind,
    categoryId,
    // Only meaningful for transfers, so a stale field can never leak into another kind.
    transferAccountId: categoryKind === "transfer" ? data.transferAccountId ?? null : null,
    merchantName,
    merchantEntityId: nonEmpty(data.merchantEntityId),
    rawName,
    originalDescription: nonEmpty(data.originalDescription),
    logoUrl: nonEmpty(data.logoUrl),
    categorySource: categoryId ? toSource(data.categorySource) : null,
    ruleId: nonEmpty(data.ruleId),
    suggestedCategoryId: categoryId ? null : nonEmpty(data.suggestedCategoryId),
    customName,
    hidden: data.hidden === true,
    notes: nonEmpty(data.notes),
    authorizedDate: nonEmpty(data.authorizedDate),
    website: nonEmpty(data.website),
  };
}

/** First day of the month `months` months ago, as YYYY-MM-DD (transaction dates use this format). */
export function cutoffDate(months: number, now: Date = new Date()): string {
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const month = String(cutoff.getMonth() + 1).padStart(2, "0");
  return `${cutoff.getFullYear()}-${month}-01`;
}

/** Whole months from a "YYYY-MM" key to the current month (0 for this month or later). */
export function monthsSince(monthKey: string | undefined, now: Date = new Date()): number {
  if (!monthKey) return 0;
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return 0;
  return Math.max(0, (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month));
}
