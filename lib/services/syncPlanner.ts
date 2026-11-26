import { CATEGORY_SOURCES, type Assignment, type CategorizeInput } from "@/lib/categorization";
import { normalizeMerchant } from "@/lib/merchant";
import type { CategoryKind, CategorySource } from "@/lib/types/types";
import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";

/**
 * Pure sync planning: turns one page of Plaid's added, modified, and removed
 * lists plus the transaction docs that already exist into Firestore writes.
 * No I/O, so it can be unit tested.
 */

export type { Assignment } from "@/lib/categorization";

/** Set by you or the rules engine, never by Plaid, and kept when Plaid changes a transaction. */
export type UserFields = {
  categorySource: CategorySource | null;
  ruleId: string | null;
  suggestedCategoryId: string | null;
  customName: string | null;
  hidden: boolean;
  notes: string | null;
};

/** A transaction doc's category and user fields, as read before planning. */
export type StoredTransaction = Assignment & Partial<UserFields>;

/** What the rules engine returns. Fields it leaves out are stored empty. */
export type Categorized = Assignment & Partial<Omit<UserFields, "notes">>;

/** Fields copied from Plaid on every write. Never includes the category. */
export type PlaidFields = {
  /** The Telos account doc. Usually equal to plaidAccountId; differs after a bank is reattached. */
  accountId: string;
  plaidAccountId: string;
  plaidItemId: string;
  amount: number;
  date: string;
  authorizedDate: string | null;
  merchantName: string | null;
  merchantEntityId: string | null;
  rawName: string;
  originalDescription: string | null;
  logoUrl: string | null;
  website: string | null;
  paymentChannel: string | null;
  pending: boolean;
  pendingTransactionId: string | null;
  category: PlaidTransaction["personal_finance_category"] | null;
  /** Set when Plaid removes the transaction. The doc is deleted when the sync loop finishes. */
  removedByPlaid: boolean;
  /** When the sync job last received this transaction from Plaid (ms). */
  plaidSeenAt: number;
};

export type NewTransactionDoc = PlaidFields & Assignment & UserFields & { createdAt: number; updatedAt: number };

export type WriteOp =
  | { type: "create"; id: string; data: NewTransactionDoc }
  | { type: "update"; id: string; data: PlaidFields & Partial<Assignment & UserFields> & { updatedAt: number } }
  | { type: "markRemoved"; id: string; data: { removedByPlaid: true; updatedAt: number } }
  | { type: "delete"; id: string };

/** A transaction saved under an earlier connection or account id, waiting for its re-imported copy. */
export type LegacyTransaction = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  rawName: string;
  pending: boolean;
  assignment: StoredTransaction;
};

/** Legacy transactions by legacyKey. Matches are removed as they are used. */
export type LegacyIndex = Map<string, LegacyTransaction[]>;

export type SyncPlan = {
  ops: WriteOp[];
  added: number;
  modified: number;
  removed: number;
  /** Ids marked removed in this page. They are deleted when the loop finishes. */
  markedRemovedIds: string[];
  /** Re-imported transactions that replaced an older copy and kept its category. */
  carriedOver: number;
};

export type PlanInput = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: RemovedTransaction[];
  /**
   * Existing transaction docs, keyed by id, including ones marked removed.
   * Must include the docs for every pending_transaction_id.
   */
  existing: Map<string, StoredTransaction>;
  /** The account doc for a Plaid account id, or null when that account doesn't sync. */
  accountDocIdFor: (plaidAccountId: string) => string | null;
  itemId: string;
  /** Rules engine: picks a category for an uncategorized transaction. */
  categorize: (fields: PlaidFields) => Categorized;
  /** Older copies of transactions that are being imported again. */
  legacy?: LegacyIndex;
  now: number;
};

export function legacyKey(accountId: string, date: string, amount: number): string {
  return `${accountId}|${date}|${Math.round(amount * 100)}`;
}

export function buildLegacyIndex(transactions: LegacyTransaction[]): LegacyIndex {
  const index: LegacyIndex = new Map();
  for (const tx of transactions) {
    const key = legacyKey(tx.accountId, tx.date, tx.amount);
    const list = index.get(key);
    if (list) list.push(tx);
    else index.set(key, [tx]);
  }
  return index;
}

export function toPlaidFields(tx: PlaidTransaction, accountId: string, itemId: string, now: number): PlaidFields {
  return {
    accountId,
    plaidAccountId: tx.account_id,
    plaidItemId: itemId,
    amount: tx.amount,
    date: tx.date,
    authorizedDate: tx.authorized_date ?? null,
    merchantName: tx.merchant_name ?? null,
    merchantEntityId: tx.merchant_entity_id ?? null,
    rawName: tx.name,
    originalDescription: tx.original_description ?? null,
    logoUrl: tx.logo_url ?? null,
    website: tx.website ?? null,
    paymentChannel: tx.payment_channel ?? null,
    pending: tx.pending,
    pendingTransactionId: tx.pending_transaction_id ?? null,
    category: tx.personal_finance_category ?? null,
    removedByPlaid: false,
    plaidSeenAt: now,
  };
}

/** The engine's view of a transaction the sync job is writing. */
export function toCategorizeInput(fields: PlaidFields): CategorizeInput {
  return {
    accountId: fields.accountId,
    amount: fields.amount,
    merchantName: fields.merchantName,
    merchantEntityId: fields.merchantEntityId,
    rawName: fields.rawName,
    originalDescription: fields.originalDescription,
    plaidPrimary: fields.category?.primary ?? null,
    plaidDetailed: fields.category?.detailed ?? null,
    plaidConfidence: fields.category?.confidence_level ?? null,
  };
}

export function isCategorized(assignment: Assignment | undefined): boolean {
  return Boolean(assignment?.categoryKind && assignment.categoryId);
}

const KINDS: readonly CategoryKind[] = ["income", "expense", "transfer"];

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** A stored doc's category and user fields, with anything malformed read as empty. */
export function toStoredTransaction(data: Record<string, unknown>): StoredTransaction {
  return {
    categoryKind: KINDS.find((kind) => kind === data.categoryKind) ?? null,
    categoryId: textOrNull(data.categoryId),
    transferAccountId: textOrNull(data.transferAccountId),
    categorySource: CATEGORY_SOURCES.find((source) => source === data.categorySource) ?? null,
    ruleId: textOrNull(data.ruleId),
    suggestedCategoryId: textOrNull(data.suggestedCategoryId),
    customName: textOrNull(data.customName),
    hidden: data.hidden === true,
    notes: textOrNull(data.notes),
  };
}

const EMPTY: Assignment & UserFields = {
  categoryKind: null,
  categoryId: null,
  transferAccountId: null,
  categorySource: null,
  ruleId: null,
  suggestedCategoryId: null,
  customName: null,
  hidden: false,
  notes: null,
};

const USER_EDITS = ["customName", "hidden", "notes"] as const;

/** Your rename, hiding, and notes on the copy a new transaction replaces. */
function userEdits(source: StoredTransaction | undefined): Partial<UserFields> {
  const edits: Partial<UserFields> = {};
  if (!source) return edits;
  for (const key of USER_EDITS) {
    if (source[key] !== undefined) Object.assign(edits, { [key]: source[key] });
  }
  return edits;
}

/** Only defined fields, so a doc never holds undefined (Firestore rejects it). */
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * The older copy a re-imported transaction replaces: same account, date,
 * amount, and pending state, preferring the same description. Pending and
 * posted copies are never matched with each other.
 */
function takeLegacy(legacy: LegacyIndex | undefined, fields: PlaidFields): LegacyTransaction | undefined {
  if (!legacy) return undefined;
  const candidates = legacy.get(legacyKey(fields.accountId, fields.date, fields.amount));
  if (!candidates) return undefined;

  const name = normalizeMerchant(fields.rawName);
  let best = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].pending !== fields.pending) continue;
    if (best === -1) best = i;
    if (normalizeMerchant(candidates[i].rawName) === name) {
      best = i;
      break;
    }
  }
  if (best === -1) return undefined;
  return candidates.splice(best, 1)[0];
}

export function planSync(input: PlanInput): SyncPlan {
  const { existing, accountDocIdFor, itemId, categorize, legacy, now } = input;
  const ops: WriteOp[] = [];
  // Docs as they will be after the ops so far, so a transaction delivered
  // twice in one page is created once.
  const state = new Map(existing);
  const markedRemovedIds: string[] = [];
  let added = 0;
  let modified = 0;
  let removed = 0;
  let carriedOver = 0;

  const upsert = (tx: PlaidTransaction, isModified: boolean) => {
    const accountId = accountDocIdFor(tx.account_id);
    if (!accountId) return;
    const fields = toPlaidFields(tx, accountId, itemId, now);
    const current = state.get(tx.transaction_id);

    if (current) {
      // Plaid fields only. A category is never overwritten, and your renames
      // and notes are never touched; rules run only while the transaction
      // is uncategorized.
      let next: Partial<Assignment & UserFields> | undefined;
      if (!isCategorized(current)) {
        const result = categorize(fields);
        if (isCategorized(result)) {
          next = {
            categoryKind: result.categoryKind,
            categoryId: result.categoryId,
            transferAccountId: result.transferAccountId,
            categorySource: result.categorySource ?? null,
            ruleId: result.ruleId ?? null,
            suggestedCategoryId: null,
          };
        } else if ((result.suggestedCategoryId ?? null) !== (current.suggestedCategoryId ?? null)) {
          next = { suggestedCategoryId: result.suggestedCategoryId ?? null };
        }
      }
      ops.push({ type: "update", id: tx.transaction_id, data: { ...fields, ...next, updatedAt: now } });
      if (next) state.set(tx.transaction_id, { ...current, ...next });
      if (isModified) modified += 1;
      return;
    }

    // A posted transaction keeps the category set on its pending version, and
    // a re-imported one keeps the category of the copy it replaces. Either
    // way your rename, hiding, and notes come along.
    const pendingSource = fields.pendingTransactionId ? state.get(fields.pendingTransactionId) : undefined;
    const older = takeLegacy(legacy, fields);
    const categorizedSource = isCategorized(pendingSource)
      ? pendingSource
      : older && isCategorized(older.assignment)
        ? older.assignment
        : undefined;
    const assignment = categorizedSource ?? categorize(fields);

    const data: NewTransactionDoc = {
      ...fields,
      ...EMPTY,
      ...defined(assignment),
      ...defined(userEdits(pendingSource ?? older?.assignment)),
      createdAt: now,
      updatedAt: now,
    };
    ops.push({ type: "create", id: tx.transaction_id, data });
    state.set(tx.transaction_id, data);
    added += 1;

    if (older) {
      ops.push({ type: "delete", id: older.id });
      state.delete(older.id);
      carriedOver += 1;
    }
  };

  input.added.forEach((tx) => upsert(tx, false));
  input.modified.forEach((tx) => upsert(tx, true));

  // Removals are marked, not deleted: a posted transaction in a later page may
  // still need to copy the category from its pending version.
  for (const tx of input.removed) {
    if (tx.account_id && accountDocIdFor(tx.account_id) === null) continue;
    if (!state.has(tx.transaction_id)) continue;
    ops.push({ type: "markRemoved", id: tx.transaction_id, data: { removedByPlaid: true, updatedAt: now } });
    markedRemovedIds.push(tx.transaction_id);
    state.delete(tx.transaction_id);
    removed += 1;
  }

  return { ops, added, modified, removed, markedRemovedIds, carriedOver };
}
