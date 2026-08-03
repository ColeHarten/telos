import { adminDb } from "@/lib/firebaseAdmin";
import type { CategoryKind } from "@/lib/types/types";
import type { DocumentReference, WriteBatch } from "firebase-admin/firestore";
import type {
  RemovedTransaction as PlaidRemovedTransaction,
  Transaction as PlaidTransaction,
} from "plaid";
import { syncTransactions } from "./plaidService";
import { applyRules, buildRulesContext } from "./ruleEngine";

const MAX_BATCH_SIZE = 500;

/**
 * Shape of a Plaid Item document as stored in Firestore.
 */
interface PlaidItemDoc {
  accessToken: string;
  itemId: string;
  cursor: string;
  createdAt: number;
  institutionId: string | null;
  institutionName: string | null;
}

/**
 * Shape of a transaction document as stored in Firestore.
 *
 * categoryKind/categoryId replace the old cashflowId field. The read side
 * (useTransactions.ts) reads these two field names directly — every doc
 * written from here on out uses this shape.
 *
 * (These were previously named assignmentType/assignmentId here and in
 * ruleEngine.ts, which meant synced transactions were writing to fields
 * useTransactions.ts never read. Renamed to match the read side.)
 *
 * categoryKind/categoryId are `null` (not a sentinel string like the old
 * "unassigned") when a transaction hasn't been categorized. Firestore can't
 * store `undefined`, so `null` is the on-disk representation of
 * "unassigned" — the client layer (useTransactions.ts) converts this to
 * `undefined` when building its in-memory Transaction objects.
 */
interface TransactionDoc {
  accountId: string;
  amount: number;
  date: string;
  merchantName: string | null;
  rawName: string; // Plaid's legacy `name` field, kept for reference/debugging
  pending: boolean;
  category: PlaidTransaction["personal_finance_category"] | null;
  categoryKind: CategoryKind | null;
  categoryId: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Partial update applied to an existing transaction document.
 *
 * Deliberately does NOT include categoryKind/categoryId — a Plaid
 * "modified" event should never clobber a user's (or a prior rule's)
 * assignment on an existing transaction.
 */
type TransactionUpdate = Pick<TransactionDoc, "amount" | "rawName" | "pending" | "updatedAt">;

type BatchOp =
  | { type: "set"; ref: DocumentReference; data: TransactionDoc }
  | { type: "merge"; ref: DocumentReference; data: TransactionUpdate }
  | { type: "delete"; ref: DocumentReference };

interface SyncPlaidItemResult {
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
}

interface SyncAllPlaidItemsResult {
  added: number;
  modified: number;
  removed: number;
}

/**
 * Commits an arbitrary list of write operations in chunks of at most
 * MAX_BATCH_SIZE, since a single Firestore batch cannot exceed 500 writes.
 */
async function commitInChunks(ops: BatchOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_BATCH_SIZE) {
    const chunk = ops.slice(i, i + MAX_BATCH_SIZE);
    const batch: WriteBatch = adminDb.batch();

    for (const op of chunk) {
      if (op.type === "set") {
        batch.set(op.ref, op.data);
      } else if (op.type === "merge") {
        batch.set(op.ref, op.data, { merge: true });
      } else {
        batch.delete(op.ref);
      }
    }

    await batch.commit();
  }
}

export async function syncPlaidItem(
  uid: string,
  itemId: string
): Promise<SyncPlaidItemResult> {
  const itemRef = adminDb
    .collection("users")
    .doc(uid)
    .collection("plaidItems")
    .doc(itemId);

  const itemSnap = await itemRef.get();

  if (!itemSnap.exists) throw new Error("Plaid item not found");

  const item = itemSnap.data() as PlaidItemDoc;

  let cursor = item.cursor || "";
  let hasMore = true;

  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: PlaidRemovedTransaction[] = [];

  while (hasMore) {
    const data = await syncTransactions(item.accessToken, cursor);
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  const txRef = adminDb.collection("users").doc(uid).collection("transactions");
  const ops: BatchOp[] = [];

  // Fetch categories + automations once for this sync run, not once per transaction.
  const rulesContext = await buildRulesContext(uid);

  // INSERT
  for (const tx of added) {
    const data: TransactionDoc = await applyRules(
      {
        accountId: tx.account_id,
        amount: tx.amount,
        date: tx.date,
        merchantName: tx.merchant_name ?? null,
        rawName: tx.name,
        pending: tx.pending,
        category: tx.personal_finance_category ?? null,
        categoryKind: null,
        categoryId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      rulesContext
    );

    ops.push({ type: "set", ref: txRef.doc(tx.transaction_id), data });
  }

  // UPDATE
  for (const tx of modified) {
    const data: TransactionUpdate = {
      amount: tx.amount,
      rawName: tx.name,
      pending: tx.pending,
      updatedAt: Date.now(),
    };

    ops.push({ type: "merge", ref: txRef.doc(tx.transaction_id), data });
  }

  // DELETE
  for (const tx of removed) {
    ops.push({ type: "delete", ref: txRef.doc(tx.transaction_id) });
  }

  await commitInChunks(ops);

  // Only advance the cursor after all pages have been fetched and
  // all writes for this sync have committed.
  await itemRef.update({ cursor });

  return {
    addedCount: added.length,
    modifiedCount: modified.length,
    removedCount: removed.length,
  };
}

export async function syncAllPlaidItems(
  uid: string
): Promise<SyncAllPlaidItemsResult> {
  const itemsSnap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("plaidItems")
    .get();

  const total: SyncAllPlaidItemsResult = {
    added: 0,
    modified: 0,
    removed: 0,
  };

  for (const doc of itemsSnap.docs) {
    const result = await syncPlaidItem(uid, doc.id);

    total.added += result.addedCount;
    total.modified += result.modifiedCount;
    total.removed += result.removedCount;
  }

  return total;
}