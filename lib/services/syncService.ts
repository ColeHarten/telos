import "server-only";

import { randomUUID } from "crypto";
import { FieldValue, type CollectionReference, type DocumentReference } from "firebase-admin/firestore";
import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";
import { ApiError } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { decryptSecretWithStatus, encryptSecret } from "./encryption";
import { errorFields, logError, logWarn } from "./logging";
import { fetchAccounts, getPlaidErrorCode, removeItem, syncTransactions } from "./plaidService";
import { applyRules, buildRulesContext } from "./ruleEngine";
import { planSync, type Assignment, type WriteOp } from "./syncPlanner";

const MAX_BATCH_SIZE = 500;
const MAX_GET_ALL = 300;
// Longer than one sync can run (the route's maxDuration is 60s), so a lease
// left behind by a crashed run expires on its own.
const LEASE_MS = 2 * 60 * 1000;
const MAX_PAGINATION_RESTARTS = 3;

/** Stored per bank connection. Server only; the rules deny all browser access. */
interface PlaidItemDoc {
  accessToken: string;
  itemId: string;
  cursor: string;
  createdAt: number;
  institutionId: string | null;
  institutionName: string | null;
  // Plaid account_ids that were duplicates of already-linked accounts at link
  // time. They have no Account doc, so their transactions are ignored.
  skippedDuplicateAccountIds?: string[];
  syncLeaseId?: string;
  syncLeaseUntil?: number;
}

export type SyncItemResult =
  | { status: "synced"; added: number; modified: number; removed: number }
  | { status: "in_progress" };

export type SyncAllResult = {
  added: number;
  modified: number;
  removed: number;
  /** Connections the user must reconnect through update-mode Link. */
  itemsNeedingReauth: string[];
  /** Connections that failed for another reason; details are on their status doc. */
  itemsFailed: string[];
  /** Connections skipped because another sync was already running. */
  itemsInProgress: string[];
};

/** A disconnect or delete was refused because a sync of the same bank is running (409). */
export class SyncInProgressError extends ApiError {
  constructor() {
    super(409, "sync_in_progress", "This bank is syncing right now. Try again in a minute.");
    this.name = "SyncInProgressError";
  }
}

/** The connection was disconnected before this run could start. */
class ItemRemovedError extends Error {}

function userDoc(uid: string) {
  return getAdminDb().collection("users").doc(uid);
}

export function plaidItemsCollection(uid: string) {
  return userDoc(uid).collection("plaidItems");
}

/** Sync status the browser can read: one doc per connection, same id as plaidItems. */
export function plaidItemStatusCollection(uid: string) {
  return userDoc(uid).collection("plaidItemStatus");
}

async function writeSyncSuccess(uid: string, itemId: string, institutionName: string | null): Promise<void> {
  await plaidItemStatusCollection(uid).doc(itemId).set(
    {
      institutionName,
      needsReauth: false,
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastSyncError: null,
      lastSyncErrorAt: null,
    },
    { merge: true }
  );
}

async function writeSyncFailure(uid: string, itemId: string, errorCode: string, needsReauth: boolean): Promise<void> {
  await plaidItemStatusCollection(uid).doc(itemId).set(
    { needsReauth, lastSyncError: errorCode, lastSyncErrorAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// ---------------------------------------------------------------- lease

/** Claims the connection for this run. Returns null if another sync holds it. */
async function acquireLease(itemRef: DocumentReference): Promise<string | null> {
  const leaseId = randomUUID();
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new ItemRemovedError();
    const data = snap.data() as PlaidItemDoc;
    if ((data.syncLeaseUntil ?? 0) > Date.now()) return null;
    tx.update(itemRef, { syncLeaseId: leaseId, syncLeaseUntil: Date.now() + LEASE_MS });
    return leaseId;
  });
}

/**
 * Takes the lease for a change other than a sync, so no sync writes to the
 * connection's accounts meanwhile. Returns null if the connection is gone.
 */
async function leaseForChange(itemRef: DocumentReference): Promise<string | null> {
  try {
    const leaseId = await acquireLease(itemRef);
    if (!leaseId) throw new SyncInProgressError();
    return leaseId;
  } catch (err) {
    if (err instanceof ItemRemovedError) return null;
    throw err;
  }
}

async function releaseLease(itemRef: DocumentReference, leaseId: string): Promise<void> {
  await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (snap.exists && (snap.data() as PlaidItemDoc).syncLeaseId === leaseId) {
      tx.update(itemRef, { syncLeaseId: FieldValue.delete(), syncLeaseUntil: FieldValue.delete() });
    }
  });
}

// ---------------------------------------------------------------- Plaid reads

type Changes = { added: PlaidTransaction[]; modified: PlaidTransaction[]; removed: RemovedTransaction[]; cursor: string };

/**
 * Pages through /transactions/sync from the stored cursor. If Plaid reports
 * that data changed mid-pagination, the whole run restarts from the stored
 * cursor, as Plaid requires.
 */
async function fetchChanges(accessToken: string, startCursor: string): Promise<Changes> {
  for (let attempt = 0; ; attempt++) {
    const changes: Changes = { added: [], modified: [], removed: [], cursor: startCursor };
    try {
      let hasMore = true;
      while (hasMore) {
        const page = await syncTransactions(accessToken, changes.cursor);
        changes.added.push(...page.added);
        changes.modified.push(...page.modified);
        changes.removed.push(...page.removed);
        changes.cursor = page.next_cursor;
        hasMore = page.has_more;
      }
      return changes;
    } catch (err) {
      const restart = getPlaidErrorCode(err) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
      if (!restart || attempt >= MAX_PAGINATION_RESTARTS) throw err;
      logWarn("sync", "Data changed during pagination; restarting", { attempt: attempt + 1 });
    }
  }
}

// ---------------------------------------------------------------- Firestore I/O

async function readExisting(txCollection: CollectionReference, ids: string[]): Promise<Map<string, Assignment>> {
  const existing = new Map<string, Assignment>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += MAX_GET_ALL) {
    const refs = unique.slice(i, i + MAX_GET_ALL).map((id) => txCollection.doc(id));
    const snaps = await getAdminDb().getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() ?? {};
      existing.set(snap.id, {
        categoryKind: data.categoryKind ?? null,
        categoryId: data.categoryId ?? null,
        transferAccountId: data.transferAccountId ?? null,
      });
    }
  }
  return existing;
}

async function commitOps(txCollection: CollectionReference, ops: WriteOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_BATCH_SIZE) {
    const batch = getAdminDb().batch();
    for (const op of ops.slice(i, i + MAX_BATCH_SIZE)) {
      const ref = txCollection.doc(op.id);
      if (op.type === "create") batch.set(ref, op.data);
      else if (op.type === "update") batch.set(ref, op.data, { merge: true });
      else batch.delete(ref);
    }
    await batch.commit();
  }
}

/** Writes Plaid's current balances to this connection's existing Account docs. */
async function refreshBalances(uid: string, accessToken: string, skipped: ReadonlySet<string>): Promise<void> {
  const plaidAccounts = (await fetchAccounts(accessToken)).filter((acc) => !skipped.has(acc.account_id));
  if (plaidAccounts.length === 0) return;

  const accountsRef = userDoc(uid).collection("accounts");
  const snaps = await getAdminDb().getAll(...plaidAccounts.map((acc) => accountsRef.doc(acc.account_id)));
  const now = Date.now();
  const batch = getAdminDb().batch();
  let writes = 0;

  snaps.forEach((snap, index) => {
    const balance = plaidAccounts[index].balances.current;
    // Deleted or skipped accounts are never re-created.
    if (!snap.exists || balance == null) return;
    batch.update(snap.ref, { currentBalance: balance, balanceUpdatedAt: now, updatedAt: now });
    writes += 1;
  });

  if (writes > 0) await batch.commit();
}

// ---------------------------------------------------------------- sync

export async function syncPlaidItem(uid: string, itemId: string): Promise<SyncItemResult> {
  const itemRef = plaidItemsCollection(uid).doc(itemId);
  const leaseId = await acquireLease(itemRef);
  if (!leaseId) return { status: "in_progress" };

  try {
    const itemSnap = await itemRef.get();
    const item = itemSnap.data() as PlaidItemDoc;
    const { plaintext: accessToken, needsReencryption } = decryptSecretWithStatus(item.accessToken);

    const changes = await fetchChanges(accessToken, item.cursor || "");
    const txCollection = userDoc(uid).collection("transactions");
    const skipped = new Set(item.skippedDuplicateAccountIds ?? []);

    // Read every doc the plan depends on before writing, including the
    // pending versions of newly posted transactions.
    const ids = [
      ...changes.added.map((tx) => tx.transaction_id),
      ...changes.added.map((tx) => tx.pending_transaction_id).filter((id): id is string => Boolean(id)),
      ...changes.modified.map((tx) => tx.transaction_id),
      ...changes.removed.map((tx) => tx.transaction_id),
    ];
    const [existing, rulesContext] = await Promise.all([readExisting(txCollection, ids), buildRulesContext(uid)]);

    const plan = planSync({
      added: changes.added,
      modified: changes.modified,
      removed: changes.removed,
      existing,
      skippedAccountIds: skipped,
      categorize: (fields) => {
        const result = applyRules({ ...fields, categoryKind: null, categoryId: null, transferAccountId: null }, rulesContext);
        return { categoryKind: result.categoryKind, categoryId: result.categoryId, transferAccountId: result.transferAccountId };
      },
      now: Date.now(),
    });

    await commitOps(txCollection, plan.ops);
    await refreshBalances(uid, accessToken, skipped);

    // The cursor moves only after every write succeeded, so a failed run is
    // retried from the same point. Old-format tokens are re-encrypted here.
    await itemRef.update({
      cursor: changes.cursor,
      ...(needsReencryption ? { accessToken: encryptSecret(accessToken) } : {}),
    });
    await writeSyncSuccess(uid, itemId, item.institutionName ?? null);

    return { status: "synced", added: plan.added, modified: plan.modified, removed: plan.removed };
  } finally {
    await releaseLease(itemRef, leaseId).catch((err: unknown) => {
      logWarn("sync", "Could not release sync lease", { itemId, ...errorFields(err) });
    });
  }
}

export type ItemOutcome =
  | SyncItemResult
  | { status: "needs_reauth" }
  | { status: "failed"; errorCode: string }
  | { status: "removed" };

/** Syncs one connection and records the outcome on its status doc. Never throws. */
export async function syncItemAndRecord(uid: string, itemId: string): Promise<ItemOutcome> {
  try {
    return await syncPlaidItem(uid, itemId);
  } catch (err) {
    // Disconnected since the sync was requested: nothing to sync or record.
    if (err instanceof ItemRemovedError) return { status: "removed" };

    const plaidCode = getPlaidErrorCode(err);
    const needsReauth = plaidCode === "ITEM_LOGIN_REQUIRED";
    const errorCode = plaidCode ?? "SYNC_FAILED";

    if (needsReauth) logWarn("sync", "Item needs reauth", { itemId });
    else logError("sync", err, { itemId });

    await writeSyncFailure(uid, itemId, errorCode, needsReauth).catch((writeErr: unknown) => {
      logWarn("sync", "Could not record sync failure", { itemId, ...errorFields(writeErr) });
    });
    return needsReauth ? { status: "needs_reauth" } : { status: "failed", errorCode };
  }
}

/** Syncs every connection. One failing connection never stops the others. */
export async function syncAllPlaidItems(uid: string): Promise<SyncAllResult> {
  const itemsSnap = await plaidItemsCollection(uid).get();
  const total: SyncAllResult = {
    added: 0,
    modified: 0,
    removed: 0,
    itemsNeedingReauth: [],
    itemsFailed: [],
    itemsInProgress: [],
  };

  for (const itemDoc of itemsSnap.docs) {
    const outcome = await syncItemAndRecord(uid, itemDoc.id);
    if (outcome.status === "synced") {
      total.added += outcome.added;
      total.modified += outcome.modified;
      total.removed += outcome.removed;
    } else if (outcome.status === "needs_reauth") {
      total.itemsNeedingReauth.push(itemDoc.id);
    } else if (outcome.status === "failed") {
      total.itemsFailed.push(itemDoc.id);
    } else if (outcome.status === "in_progress") {
      total.itemsInProgress.push(itemDoc.id);
    }
  }

  return total;
}

/**
 * Revokes Plaid's access to a connection, deletes its records, and converts
 * its accounts to manual accounts (history kept, balance frozen). A connection
 * that is already gone still succeeds. Returns the number of accounts converted.
 * Throws SyncInProgressError (409) while a sync of the connection is running.
 */
export async function disconnectPlaidItem(uid: string, itemId: string): Promise<number> {
  const db = getAdminDb();
  const itemRef = plaidItemsCollection(uid).doc(itemId);

  // The lease is deleted with the connection below.
  const leaseId = await leaseForChange(itemRef);
  if (leaseId) {
    const { accessToken } = (await itemRef.get()).data() as PlaidItemDoc;
    try {
      await removeItem(decryptSecretWithStatus(accessToken).plaintext);
    } catch (err) {
      // Plaid may already have revoked the item; local records are removed either way.
      logWarn("disconnect-item", "Plaid itemRemove failed; removing local records", { itemId, ...errorFields(err) });
    }
  }

  const accounts = await db.collection("users").doc(uid).collection("accounts").where("plaidItemId", "==", itemId).get();
  const now = Date.now();
  const batch = db.batch();
  batch.delete(itemRef);
  batch.delete(plaidItemStatusCollection(uid).doc(itemId));
  accounts.docs.forEach((d) =>
    batch.update(d.ref, { isManual: true, plaidItemId: null, plaidAccountId: null, updatedAt: now })
  );
  await batch.commit();

  return accounts.size;
}

/**
 * Stops a connection syncing one account, before that account is deleted.
 * Holding the lease means no sync that read the old skip list is still running.
 * Throws SyncInProgressError (409) while a sync of the connection is running.
 */
export async function skipAccountInSync(uid: string, itemId: string, accountId: string): Promise<void> {
  const itemRef = plaidItemsCollection(uid).doc(itemId);
  const leaseId = await leaseForChange(itemRef);
  if (!leaseId) return;
  try {
    await itemRef.update({ skippedDuplicateAccountIds: FieldValue.arrayUnion(accountId) });
  } finally {
    await releaseLease(itemRef, leaseId).catch((err: unknown) => {
      logWarn("delete-account", "Could not release sync lease", { itemId, ...errorFields(err) });
    });
  }
}
