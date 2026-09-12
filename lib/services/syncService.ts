import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import type { CategoryKind } from "@/lib/types/types";
import type { DocumentReference, WriteBatch } from "firebase-admin/firestore";
import type {
  RemovedTransaction as PlaidRemovedTransaction,
  Transaction as PlaidTransaction,
} from "plaid";
import { syncTransactions, getPlaidErrorCode } from "./plaidService";
import { decryptSecret } from "./encryption";
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
  needsReauth?: boolean;
  lastSyncError?: string;
  lastSyncErrorAt?: number;
  // Set whenever syncPlaidItem completes successfully for this item (server
  // timestamp). Read client-side by useAccounts.ts to power the
  // "Last Synced" display on the Transactions page — see 2.4.
  lastSyncedAt?: FirebaseFirestore.Timestamp;
  // Plaid account_ids under this item that exchange-token identified as
  // duplicates of an already-linked account at link time, so they have no
  // corresponding Account doc. Every sync excludes their transactions too,
  // so they don't pile up as orphaned "Unlinked Account" rows.
  skippedDuplicateAccountIds?: string[];
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
 *
 * transferAccountId is only meaningful when categoryKind === "transfer". It
 * is the destination Account id resolved from the matched Category's
 * transferAccountId at the moment applyRules assigned the transaction —
 * denormalized here (rather than re-resolved later via a join against
 * categories) so downstream consumers (budget "actual" totals, account
 * deletion isolation checks — see useAccounts.ts) keep working even if the
 * source transfer Category is later hard-deleted (see
 * reconcileContributionTransfers in useCategories.ts).
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
  transferAccountId: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Partial update applied to an existing transaction document.
 *
 * Deliberately does NOT include categoryKind/categoryId/transferAccountId —
 * a Plaid "modified" event should never clobber a user's (or a prior
 * rule's) assignment on an existing transaction.
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
  // Item IDs skipped because their login needs to be refreshed via Plaid
  // Link's update mode — see createUpdateModeLinkToken in plaidService.ts.
  itemsNeedingReauth: string[];
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
  const itemRef = adminDb.collection("users").doc(uid).collection("plaidItems").doc(itemId);
  const itemSnap = await itemRef.get();

  if (!itemSnap.exists) throw new Error("Plaid item not found");

  const item = itemSnap.data() as PlaidItemDoc;
  const accessToken = decryptSecret(item.accessToken);
  const skippedAccountIds = new Set(item.skippedDuplicateAccountIds ?? []);

  let cursor = item.cursor || "";
  let hasMore = true;

  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: PlaidRemovedTransaction[] = [];

  while (hasMore) {
    const data = await syncTransactions(accessToken, cursor);
    added.push(...data.added);
    modified.push(...data.modified);
    removed.push(...data.removed);
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  // Never write transactions for an account we intentionally didn't create
  // an Account doc for (see exchange-token/route.ts's dedupe step).
  const filteredAdded = added.filter((tx) => !skippedAccountIds.has(tx.account_id));
  const filteredModified = modified.filter((tx) => !skippedAccountIds.has(tx.account_id));
  const filteredRemoved = removed.filter((tx) => !skippedAccountIds.has(tx.account_id));

  const txRef = adminDb.collection("users").doc(uid).collection("transactions");
  const ops: BatchOp[] = [];
  const rulesContext = await buildRulesContext(uid);

  for (const tx of filteredAdded) {
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
        transferAccountId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      rulesContext
    );
    ops.push({ type: "set", ref: txRef.doc(tx.transaction_id), data });
  }

  for (const tx of filteredModified) {
    const data: TransactionUpdate = {
      amount: tx.amount,
      rawName: tx.name,
      pending: tx.pending,
      updatedAt: Date.now(),
    };
    ops.push({ type: "merge", ref: txRef.doc(tx.transaction_id), data });
  }

  for (const tx of filteredRemoved) {
    ops.push({ type: "delete", ref: txRef.doc(tx.transaction_id) });
  }

  await commitInChunks(ops);
  // lastSyncedAt is a server timestamp — set only on a fully successful
  // sync of this item (never on the ITEM_LOGIN_REQUIRED path in
  // syncAllPlaidItems below), so it reflects the last time this item's
  // transactions were actually refreshed rather than merely attempted.
  await itemRef.update({ cursor, needsReauth: false, lastSyncedAt: FieldValue.serverTimestamp() });

  return {
    addedCount: filteredAdded.length,
    modifiedCount: filteredModified.length,
    removedCount: filteredRemoved.length,
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
    itemsNeedingReauth: [],
  };

  for (const itemDoc of itemsSnap.docs) {
    try {
      const result = await syncPlaidItem(uid, itemDoc.id);

      total.added += result.addedCount;
      total.modified += result.modifiedCount;
      total.removed += result.removedCount;
    } catch (err) {
      if (getPlaidErrorCode(err) === "ITEM_LOGIN_REQUIRED") {
        // Expected, recoverable state — the item's credentials need
        // refreshing via update-mode Link, not a code fix. Don't let one
        // stale connection block syncing every other linked account.
        console.warn(`[syncService] Item ${itemDoc.id} needs reauth (ITEM_LOGIN_REQUIRED) — skipping.`);
        total.itemsNeedingReauth.push(itemDoc.id);
        await itemDoc.ref
          .update({ needsReauth: true, lastSyncError: "ITEM_LOGIN_REQUIRED", lastSyncErrorAt: Date.now() })
          .catch((updateErr) => {
            console.error(`[syncService] Failed to flag item ${itemDoc.id} as needing reauth:`, updateErr);
          });
        continue;
      }
      // Any other error is unexpected — surface it, same as before.
      throw err;
    }
  }

  return total;
}