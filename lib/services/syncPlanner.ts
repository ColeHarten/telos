import type { CategoryKind } from "@/lib/types/types";
import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";

/**
 * Pure sync planning: turns Plaid's added, modified, and removed lists plus
 * the transaction docs that already exist into Firestore writes. No I/O, so
 * it can be unit tested.
 */

export type Assignment = {
  categoryKind: CategoryKind | null;
  categoryId: string | null;
  transferAccountId: string | null;
};

/** Fields copied from Plaid on every write. Never includes the category. */
export type PlaidFields = {
  accountId: string;
  amount: number;
  date: string;
  merchantName: string | null;
  rawName: string;
  pending: boolean;
  pendingTransactionId: string | null;
  category: PlaidTransaction["personal_finance_category"] | null;
};

export type NewTransactionDoc = PlaidFields & Assignment & { createdAt: number; updatedAt: number };

export type WriteOp =
  | { type: "create"; id: string; data: NewTransactionDoc }
  | { type: "update"; id: string; data: PlaidFields & Partial<Assignment> & { updatedAt: number } }
  | { type: "delete"; id: string };

export type SyncPlan = {
  ops: WriteOp[];
  added: number;
  modified: number;
  removed: number;
};

export type PlanInput = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: RemovedTransaction[];
  /** Existing transaction docs, keyed by id. Must include the docs for every pending_transaction_id. */
  existing: Map<string, Assignment>;
  /** Plaid accounts deliberately not linked (duplicates); their transactions are ignored. */
  skippedAccountIds: Set<string>;
  /** Rules engine: picks a category for an uncategorized transaction. */
  categorize: (fields: PlaidFields) => Assignment;
  now: number;
};

export function toPlaidFields(tx: PlaidTransaction): PlaidFields {
  return {
    accountId: tx.account_id,
    amount: tx.amount,
    date: tx.date,
    merchantName: tx.merchant_name ?? null,
    rawName: tx.name,
    pending: tx.pending,
    pendingTransactionId: tx.pending_transaction_id ?? null,
    category: tx.personal_finance_category ?? null,
  };
}

export function isCategorized(assignment: Assignment | undefined): boolean {
  return Boolean(assignment?.categoryKind && assignment.categoryId);
}

const UNCATEGORIZED: Assignment = { categoryKind: null, categoryId: null, transferAccountId: null };

export function planSync(input: PlanInput): SyncPlan {
  const { existing, skippedAccountIds, categorize, now } = input;
  const ops: WriteOp[] = [];
  // Docs as they will be after the ops so far, so a transaction delivered
  // twice in one run is created once.
  const state = new Map(existing);
  let added = 0;
  let modified = 0;
  let removed = 0;

  const upsert = (tx: PlaidTransaction, isModified: boolean) => {
    if (skippedAccountIds.has(tx.account_id)) return;
    const fields = toPlaidFields(tx);
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

    // A posted transaction keeps the category set on its pending version.
    const pendingSource = fields.pendingTransactionId ? state.get(fields.pendingTransactionId) : undefined;
    const assignment = isCategorized(pendingSource) ? (pendingSource as Assignment) : categorize(fields);
    const data: NewTransactionDoc = { ...fields, ...UNCATEGORIZED, ...assignment, createdAt: now, updatedAt: now };
    ops.push({ type: "create", id: tx.transaction_id, data });
    state.set(tx.transaction_id, assignment);
    added += 1;
  };

  input.added.forEach((tx) => upsert(tx, false));
  input.modified.forEach((tx) => upsert(tx, true));

  for (const tx of input.removed) {
    if (tx.account_id && skippedAccountIds.has(tx.account_id)) continue;
    if (!state.has(tx.transaction_id)) continue;
    ops.push({ type: "delete", id: tx.transaction_id });
    state.delete(tx.transaction_id);
    removed += 1;
  }

  return { ops, added, modified, removed };
}
