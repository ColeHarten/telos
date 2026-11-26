import { normalizeMerchant } from "@/lib/merchant";
import type { CategoryKind } from "@/lib/types/types";
import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";

/**
 * Pure sync planning: turns one page of Plaid's added, modified, and removed
 * lists plus the transaction docs that already exist into Firestore writes.
 * No I/O, so it can be unit tested.
 */

export type Assignment = {
  categoryKind: CategoryKind | null;
  categoryId: string | null;
  transferAccountId: string | null;
};

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

export type NewTransactionDoc = PlaidFields & Assignment & { createdAt: number; updatedAt: number };

export type WriteOp =
  | { type: "create"; id: string; data: NewTransactionDoc }
  | { type: "update"; id: string; data: PlaidFields & Partial<Assignment> & { updatedAt: number } }
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
  assignment: Assignment;
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
  existing: Map<string, Assignment>;
  /** The account doc for a Plaid account id, or null when that account doesn't sync. */
  accountDocIdFor: (plaidAccountId: string) => string | null;
  itemId: string;
  /** Rules engine: picks a category for an uncategorized transaction. */
  categorize: (fields: PlaidFields) => Assignment;
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

export function isCategorized(assignment: Assignment | undefined): boolean {
  return Boolean(assignment?.categoryKind && assignment.categoryId);
}

const UNCATEGORIZED: Assignment = { categoryKind: null, categoryId: null, transferAccountId: null };

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
      // Plaid fields only. A category is never overwritten; rules run only
      // when the transaction is still uncategorized.
      const assignment = isCategorized(current) ? undefined : categorize(fields);
      const nextAssignment = assignment && isCategorized(assignment) ? assignment : undefined;
      ops.push({ type: "update", id: tx.transaction_id, data: { ...fields, ...nextAssignment, updatedAt: now } });
      if (nextAssignment) state.set(tx.transaction_id, nextAssignment);
      if (isModified) modified += 1;
      return;
    }

    // A posted transaction keeps the category set on its pending version, and
    // a re-imported one keeps the category of the copy it replaces.
    const pendingSource = fields.pendingTransactionId ? state.get(fields.pendingTransactionId) : undefined;
    const older = takeLegacy(legacy, fields);
    const assignment = isCategorized(pendingSource)
      ? (pendingSource as Assignment)
      : older && isCategorized(older.assignment)
        ? older.assignment
        : categorize(fields);

    const data: NewTransactionDoc = { ...fields, ...UNCATEGORIZED, ...assignment, createdAt: now, updatedAt: now };
    ops.push({ type: "create", id: tx.transaction_id, data });
    state.set(tx.transaction_id, assignment);
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
