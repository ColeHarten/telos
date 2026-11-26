import "server-only";

import { randomUUID } from "crypto";
import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type WriteBatch,
} from "firebase-admin/firestore";
import type { AccountBase } from "plaid";
import { ApiError } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { AccountType } from "@/lib/types/types";
import { planAccountReconcile, type PlaidAccountSnapshot } from "./accountReconcile";
import { decryptSecretWithStatus, encryptSecret } from "./encryption";
import type { SavedAccount, SavedItem } from "./linkGate";
import { errorFields, logError, logWarn } from "./logging";
import { isOtherPlaidEnv, storedPlaidEnv, type PlaidEnv } from "./plaidEnv";
import {
  currentPlaidEnv,
  fetchAccounts,
  getItemDetails,
  getNormalBalanceFromPlaid,
  getPlaidErrorCode,
  mapPlaidAccountType,
  refreshTransactions,
  removeItem,
  syncTransactionsPage,
} from "./plaidService";
import { categorizeTransaction } from "@/lib/categorization";
import { buildRulesContext } from "./ruleEngine";
import { importStatusOf, runSyncLoop, type ImportStatus } from "./syncLoop";
import {
  buildLegacyIndex,
  planSync,
  toCategorizeInput,
  toStoredTransaction,
  type LegacyIndex,
  type LegacyTransaction,
  type StoredTransaction,
  type WriteOp,
} from "./syncPlanner";

const MAX_BATCH_SIZE = 500;
const MAX_GET_ALL = 300;
// Longer than one request can run (maxDuration is 60s), so a lease left
// behind by a crashed run expires on its own.
const LEASE_MS = 2 * 60 * 1000;
/** Time one request spends paging through Plaid before it stops and reports `more`. */
export const SYNC_BUDGET_MS = 40 * 1000;
/** How often the consent expiry is read from Plaid. */
const CONSENT_CHECK_MS = 24 * 60 * 60 * 1000;
/** Plaid errors that only the user can fix, through Reconnect or Manage accounts. */
const REAUTH_CODES = new Set(["ITEM_LOGIN_REQUIRED", "ACCESS_NOT_GRANTED", "NO_ACCOUNTS", "USER_PERMISSION_REVOKED"]);

/** Stored per bank connection. Server only; the rules deny all browser access. */
interface PlaidItemDoc {
  accessToken: string;
  itemId: string;
  cursor: string;
  /** Where the current pagination loop began. A loop that sees TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION restarts here. */
  loopStartCursor?: string;
  createdAt: number;
  institutionId: string | null;
  institutionName: string | null;
  /** The Plaid environment the connection was linked in. Missing means sandbox. */
  plaidEnv?: PlaidEnv;
  /** Plaid account ids that never sync: deleted in Telos, or synced by another connection. */
  skippedDuplicateAccountIds?: string[];
  /** Transactions Plaid removed during the current loop. Deleted when it finishes. */
  pendingRemovalIds?: string[];
  /** Account docs whose history is being imported again under new ids (a bank linked again). */
  carryOverAccountIds?: string[];
  /** Set by Rebuild from Plaid. Transactions not seen since are deleted when the rebuild's loop finishes. */
  rebuildStartedAt?: number | null;
  consentCheckedAt?: number;
  lastSyncStartedAt?: number;
  syncLeaseId?: string;
  syncLeaseUntil?: number;
}

export type NewAccountSummary = { id: string; name: string; accountType: AccountType };

export type SyncItemResult =
  | { status: "synced"; added: number; modified: number; removed: number; more: boolean; newAccounts: NewAccountSummary[] }
  | { status: "in_progress" };

export type ItemOutcome =
  | SyncItemResult
  | { status: "needs_reauth" }
  | { status: "failed"; errorCode: string }
  | { status: "removed" }
  | { status: "other_env" };

export type SyncAllResult = {
  added: number;
  modified: number;
  removed: number;
  /** True when a connection has more to import, or wasn't reached. Call sync again. */
  more: boolean;
  /** Accounts that got a doc in this run, for the contribution prompt. */
  newAccounts: NewAccountSummary[];
  /** Connections the user must reconnect through update mode. */
  itemsNeedingReauth: string[];
  /** Connections that failed for another reason; details are on their status doc. */
  itemsFailed: string[];
  /** Connections skipped because another sync was already running. */
  itemsInProgress: string[];
  /** Connections linked in another Plaid environment, which this server leaves alone. */
  itemsOtherEnv: string[];
};

/** A change was refused because a sync of the same bank is running (409). */
export class SyncInProgressError extends ApiError {
  constructor() {
    super(409, "sync_in_progress", "This bank is syncing right now. Try again in a minute.");
    this.name = "SyncInProgressError";
  }
}

/**
 * The connection was linked in another Plaid environment (409). Its token only
 * works there, so this server must not sync, change, or remove it: a sandbox
 * server pointed at the production database would otherwise break real banks.
 */
export class OtherEnvironmentError extends ApiError {
  constructor() {
    super(409, "wrong_environment", "This bank was connected in a different Plaid environment, so it can't be changed from here.");
    this.name = "OtherEnvironmentError";
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

function accountsCollection(uid: string) {
  return userDoc(uid).collection("accounts");
}

function transactionsCollection(uid: string) {
  return userDoc(uid).collection("transactions");
}

/** One doc per linked account per day (UTC), since Plaid can't provide past balances. */
function balanceSnapshotsCollection(uid: string) {
  return userDoc(uid).collection("balanceSnapshots");
}

/** Throws OtherEnvironmentError (409) for a connection from another Plaid environment. */
export function assertItemEnvironment(item: { plaidEnv?: unknown }): void {
  if (isOtherPlaidEnv(item.plaidEnv, currentPlaidEnv())) throw new OtherEnvironmentError();
}

// ---------------------------------------------------------------- saved docs

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function toSavedAccount(snap: DocumentSnapshot): SavedAccount {
  const data = snap.data() ?? {};
  return {
    id: snap.id,
    name: typeof data.name === "string" ? data.name : "",
    accountType: (typeof data.accountType === "string" ? data.accountType : "other_asset") as AccountType,
    isArchived: data.isArchived === true,
    plaidItemId: stringOrNull(data.plaidItemId),
    plaidAccountId: stringOrNull(data.plaidAccountId),
    plaidInstitutionId: stringOrNull(data.plaidInstitutionId),
    plaidMask: stringOrNull(data.plaidMask),
    plaidType: stringOrNull(data.plaidType),
    plaidName: stringOrNull(data.plaidName),
    plaidClosed: data.plaidClosed === true,
  };
}

/** Every account doc the user has, in the shape the duplicate checks use. */
export async function listSavedAccounts(uid: string): Promise<SavedAccount[]> {
  const snap = await accountsCollection(uid).get();
  return snap.docs.map((d) => toSavedAccount(d));
}

/** The user's bank connections, without their access tokens. */
export async function listSavedItems(uid: string): Promise<SavedItem[]> {
  const snap = await plaidItemsCollection(uid).get();
  return snap.docs.map((d) => {
    const data = d.data() as Partial<PlaidItemDoc>;
    return { itemId: d.id, institutionId: data.institutionId ?? null, institutionName: data.institutionName ?? null };
  });
}

// ---------------------------------------------------------------- status doc

async function writeStatus(uid: string, itemId: string, update: Record<string, unknown>): Promise<void> {
  await plaidItemStatusCollection(uid).doc(itemId).set(update, { merge: true });
}

async function writeSyncSuccess(
  uid: string,
  itemId: string,
  item: PlaidItemDoc,
  progress: { importStatus: ImportStatus | null; hasMore: boolean; consentExpiresAt?: string | null }
): Promise<void> {
  await writeStatus(uid, itemId, {
    institutionName: item.institutionName ?? null,
    plaidEnv: storedPlaidEnv(item.plaidEnv),
    needsReauth: false,
    lastSyncedAt: FieldValue.serverTimestamp(),
    lastSyncError: null,
    lastSyncErrorAt: null,
    hasMore: progress.hasMore,
    ...(progress.importStatus ? { importStatus: progress.importStatus } : {}),
    ...(progress.consentExpiresAt !== undefined ? { consentExpiresAt: progress.consentExpiresAt } : {}),
  });
}

async function writeSyncFailure(uid: string, itemId: string, errorCode: string, needsReauth: boolean): Promise<void> {
  await writeStatus(uid, itemId, {
    needsReauth,
    lastSyncError: errorCode,
    lastSyncErrorAt: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------- lease

/** Claims the connection for this run. Returns null if another run holds it. */
async function acquireLease(itemRef: DocumentReference): Promise<string | null> {
  const leaseId = randomUUID();
  const env = currentPlaidEnv();
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new ItemRemovedError();
    const data = snap.data() as PlaidItemDoc;
    if (isOtherPlaidEnv(data.plaidEnv, env)) throw new OtherEnvironmentError();
    if ((data.syncLeaseUntil ?? 0) > Date.now()) return null;
    tx.update(itemRef, { syncLeaseId: leaseId, syncLeaseUntil: Date.now() + LEASE_MS, lastSyncStartedAt: Date.now() });
    return leaseId;
  });
}

/**
 * Takes the lease for a change other than a sync, so no sync writes to the
 * connection meanwhile. Returns null if the connection is gone. Throws
 * SyncInProgressError or OtherEnvironmentError (both 409).
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

function releaseQuietly(itemRef: DocumentReference, leaseId: string, scope: string, itemId: string): Promise<void> {
  return releaseLease(itemRef, leaseId).catch((err: unknown) => {
    logWarn(scope, "Could not release sync lease", { itemId, ...errorFields(err) });
  });
}

// ---------------------------------------------------------------- accounts

function toSnapshot(account: AccountBase): PlaidAccountSnapshot {
  return {
    plaidAccountId: account.account_id,
    name: account.name,
    mask: account.mask ?? null,
    type: account.type,
    subtype: account.subtype ?? null,
    officialName: account.official_name ?? null,
    accountType: mapPlaidAccountType(account),
    normalBalance: getNormalBalanceFromPlaid(account),
    current: account.balances.current ?? null,
    available: account.balances.available ?? null,
    limit: account.balances.limit ?? null,
  };
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export type ReconcileResult = {
  /** Plaid account id -> account doc id, for every account that syncs. */
  docIdByPlaidId: Map<string, string>;
  newAccounts: NewAccountSummary[];
  reattachedDocIds: string[];
};

/**
 * Brings a connection's account docs in line with Plaid: creates docs for
 * newly shared accounts, reattaches docs seen before (a bank linked again),
 * marks accounts that are no longer shared as closed (keeping their history),
 * refreshes balances, and records today's balance for each account.
 */
export async function reconcileItemAccounts(
  uid: string,
  itemId: string,
  item: { institutionId: string | null; skippedDuplicateAccountIds?: string[] },
  plaidAccounts: AccountBase[]
): Promise<ReconcileResult> {
  const saved = await listSavedAccounts(uid);
  const plan = planAccountReconcile({
    itemId,
    institutionId: item.institutionId,
    plaidAccounts: plaidAccounts.map(toSnapshot),
    saved,
    skippedPlaidAccountIds: new Set(item.skippedDuplicateAccountIds ?? []),
  });

  const accountsRef = accountsCollection(uid);
  const snapshotsRef = balanceSnapshotsCollection(uid);
  const now = Date.now();
  const today = utcDateKey(now);
  const batch = getAdminDb().batch();

  const plaidFields = (account: PlaidAccountSnapshot) => ({
    plaidAccountId: account.plaidAccountId,
    plaidItemId: itemId,
    plaidInstitutionId: item.institutionId,
    plaidMask: account.mask,
    plaidType: account.type,
    plaidSubtype: account.subtype,
    plaidName: account.name,
    plaidClosed: false,
  });
  const balanceFields = (account: PlaidAccountSnapshot) =>
    account.current === null ? {} : { currentBalance: account.current, balanceUpdatedAt: now };
  const recordSnapshot = (docId: string, account: PlaidAccountSnapshot) => {
    if (account.current === null) return;
    batch.set(snapshotsRef.doc(`${docId}_${today}`), {
      accountId: docId,
      date: today,
      current: account.current,
      available: account.available,
      limit: account.limit,
      updatedAt: now,
    });
  };

  for (const account of plan.creates) {
    const balance = account.current ?? 0;
    batch.set(accountsRef.doc(account.plaidAccountId), {
      name: account.name,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      startingBalance: balance,
      currentBalance: balance,
      balanceUpdatedAt: now,
      isManual: false,
      isArchived: false,
      isContributionEligible: false,
      ...plaidFields(account),
      createdAt: now,
      updatedAt: now,
    });
    recordSnapshot(account.plaidAccountId, account);
  }
  for (const { docId, account } of [...plan.reattached, ...plan.unchanged]) {
    batch.update(accountsRef.doc(docId), { isManual: false, ...plaidFields(account), ...balanceFields(account), updatedAt: now });
    recordSnapshot(docId, account);
  }
  for (const docId of plan.closed) {
    batch.update(accountsRef.doc(docId), { plaidClosed: true, updatedAt: now });
  }
  if (plan.reattached.length > 0) {
    batch.update(plaidItemsCollection(uid).doc(itemId), {
      carryOverAccountIds: FieldValue.arrayUnion(...plan.reattached.map((entry) => entry.docId)),
    });
  }
  await batch.commit();

  return {
    docIdByPlaidId: plan.docIdByPlaidId,
    newAccounts: plan.creates.map((account) => ({ id: account.plaidAccountId, name: account.name, accountType: account.accountType })),
    reattachedDocIds: plan.reattached.map((entry) => entry.docId),
  };
}

// ---------------------------------------------------------------- transactions

async function readExisting(txCollection: CollectionReference, ids: string[]): Promise<Map<string, StoredTransaction>> {
  const existing = new Map<string, StoredTransaction>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += MAX_GET_ALL) {
    const refs = unique.slice(i, i + MAX_GET_ALL).map((id) => txCollection.doc(id));
    const snaps = await getAdminDb().getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      existing.set(snap.id, toStoredTransaction(snap.data() ?? {}));
    }
  }
  return existing;
}

function applyOp(batch: WriteBatch, txCollection: CollectionReference, op: WriteOp): void {
  const ref = txCollection.doc(op.id);
  if (op.type === "create") batch.set(ref, op.data);
  else if (op.type === "delete") batch.delete(ref);
  else batch.set(ref, op.data, { merge: true });
}

async function commitOps(txCollection: CollectionReference, ops: WriteOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_BATCH_SIZE) {
    const batch = getAdminDb().batch();
    for (const op of ops.slice(i, i + MAX_BATCH_SIZE)) applyOp(batch, txCollection, op);
    await batch.commit();
  }
}

async function deleteTransactions(txCollection: CollectionReference, ids: string[]): Promise<void> {
  await commitOps(
    txCollection,
    [...new Set(ids)].map((id): WriteOp => ({ type: "delete", id }))
  );
}

/**
 * Transactions on reattached accounts that came from the account's earlier
 * Plaid id. Their re-imported copies take over their categories (see planSync).
 */
async function loadLegacy(
  uid: string,
  carryOverDocIds: string[],
  docIdByPlaidId: Map<string, string>
): Promise<LegacyIndex | undefined> {
  if (carryOverDocIds.length === 0) return undefined;

  const plaidIdByDocId = new Map<string, string>();
  docIdByPlaidId.forEach((docId, plaidId) => plaidIdByDocId.set(docId, plaidId));

  const legacy: LegacyTransaction[] = [];
  for (const docId of carryOverDocIds) {
    const currentPlaidId = plaidIdByDocId.get(docId);
    if (!currentPlaidId) continue;
    const snap = await transactionsCollection(uid).where("accountId", "==", docId).get();
    for (const d of snap.docs) {
      const data = d.data();
      if (data.removedByPlaid === true) continue;
      // Docs saved before plaidAccountId existed used the Plaid id as accountId.
      const plaidAccountId = typeof data.plaidAccountId === "string" ? data.plaidAccountId : data.accountId;
      if (plaidAccountId === currentPlaidId) continue;
      legacy.push({
        id: d.id,
        accountId: docId,
        date: typeof data.date === "string" ? data.date : "",
        amount: typeof data.amount === "number" ? data.amount : 0,
        rawName: typeof data.rawName === "string" ? data.rawName : "",
        pending: data.pending === true,
        assignment: toStoredTransaction(data),
      });
    }
  }
  return buildLegacyIndex(legacy);
}

/**
 * Runs when a pagination loop reaches the end of Plaid's changes: deletes
 * transactions Plaid removed, finishes a rebuild, and finishes a carry-over
 * once the bank's whole history is in.
 */
async function completeLoop(
  uid: string,
  itemId: string,
  syncingDocIds: Set<string>,
  legacy: LegacyIndex | undefined,
  updateStatus: string | null
): Promise<void> {
  const itemRef = plaidItemsCollection(uid).doc(itemId);
  const item = (await itemRef.get()).data() as PlaidItemDoc;
  const txCollection = transactionsCollection(uid);
  const toDelete: string[] = [];

  // 1. Transactions Plaid removed during the loop.
  const removedIds = item.pendingRemovalIds ?? [];
  for (let i = 0; i < removedIds.length; i += MAX_GET_ALL) {
    const refs = removedIds.slice(i, i + MAX_GET_ALL).map((id) => txCollection.doc(id));
    const snaps = await getAdminDb().getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists && snap.data()?.removedByPlaid === true) toDelete.push(snap.id);
    }
  }

  // 2. After Rebuild from Plaid: whatever Plaid no longer has. Accounts that
  // are no longer shared keep their history.
  const rebuildStartedAt = item.rebuildStartedAt ?? 0;
  if (rebuildStartedAt > 0) {
    const snap = await txCollection.where("plaidItemId", "==", itemId).get();
    for (const d of snap.docs) {
      const data = d.data();
      const seenAt = typeof data.plaidSeenAt === "number" ? data.plaidSeenAt : 0;
      if (syncingDocIds.has(String(data.accountId)) && seenAt < rebuildStartedAt) toDelete.push(d.id);
    }
  }

  // 3. Once the whole history is in, old pending copies that were never matched are stale.
  const historyComplete = importStatusOf(updateStatus) === "historical";
  if (historyComplete && legacy) {
    legacy.forEach((list) => list.forEach((tx) => {
      if (tx.pending) toDelete.push(tx.id);
    }));
  }

  await deleteTransactions(txCollection, toDelete);
  await itemRef.update({
    pendingRemovalIds: [],
    ...(rebuildStartedAt > 0 ? { rebuildStartedAt: null } : {}),
    ...(historyComplete && (item.carryOverAccountIds?.length ?? 0) > 0 ? { carryOverAccountIds: [] } : {}),
  });
}

// ---------------------------------------------------------------- sync

/**
 * Syncs one connection until Plaid has nothing more or `deadline` passes:
 * accounts first, then transactions page by page. Returns more: true when it
 * stopped early; the next call carries on from the saved cursor.
 */
export async function syncPlaidItem(uid: string, itemId: string, deadline: number): Promise<SyncItemResult> {
  const itemRef = plaidItemsCollection(uid).doc(itemId);
  const leaseId = await acquireLease(itemRef);
  if (!leaseId) return { status: "in_progress" };

  try {
    const item = (await itemRef.get()).data() as PlaidItemDoc;
    const { plaintext: accessToken, needsReencryption } = decryptSecretWithStatus(item.accessToken);
    if (needsReencryption) await itemRef.update({ accessToken: encryptSecret(accessToken) });

    // Accounts first, so newly shared accounts have docs before their transactions arrive.
    const accounts = await reconcileItemAccounts(uid, itemId, item, await fetchAccounts(accessToken));

    let consentExpiresAt: string | null | undefined;
    if (Date.now() - (item.consentCheckedAt ?? 0) > CONSENT_CHECK_MS) {
      consentExpiresAt = (await getItemDetails(accessToken)).consentExpiresAt;
      await itemRef.update({ consentCheckedAt: Date.now() });
    }

    const carryOver = [...new Set([...(item.carryOverAccountIds ?? []), ...accounts.reattachedDocIds])];
    const [rulesContext, legacy] = await Promise.all([
      buildRulesContext(uid),
      loadLegacy(uid, carryOver, accounts.docIdByPlaidId),
    ]);
    const syncingDocIds = new Set(accounts.docIdByPlaidId.values());
    const txCollection = transactionsCollection(uid);
    const totals = { added: 0, modified: 0, removed: 0 };

    const loop = await runSyncLoop(
      { cursor: item.cursor ?? "", loopStartCursor: item.loopStartCursor ?? item.cursor ?? "" },
      deadline,
      {
        fetchPage: async (cursor) => {
          const data = await syncTransactionsPage(accessToken, cursor);
          return {
            added: data.added,
            modified: data.modified,
            removed: data.removed,
            nextCursor: data.next_cursor,
            hasMore: data.has_more,
            updateStatus: data.transactions_update_status ?? null,
          };
        },
        applyPage: async (page, next) => {
          // Read every doc the plan depends on before writing, including the
          // pending versions of newly posted transactions.
          const ids = [
            ...page.added.map((tx) => tx.transaction_id),
            ...page.added.map((tx) => tx.pending_transaction_id).filter((id): id is string => Boolean(id)),
            ...page.modified.map((tx) => tx.transaction_id),
            ...page.removed.map((tx) => tx.transaction_id),
          ];
          const existing = await readExisting(txCollection, ids);
          const plan = planSync({
            added: page.added,
            modified: page.modified,
            removed: page.removed,
            existing,
            accountDocIdFor: (plaidAccountId) => accounts.docIdByPlaidId.get(plaidAccountId) ?? null,
            itemId,
            categorize: (fields) => categorizeTransaction(toCategorizeInput(fields), rulesContext),
            legacy,
            now: Date.now(),
          });

          await commitOps(txCollection, plan.ops);
          totals.added += plan.added;
          totals.modified += plan.modified;
          totals.removed += plan.removed;

          // The cursor moves only after the page's writes succeeded.
          await itemRef.update({
            cursor: next.cursor,
            loopStartCursor: next.loopStartCursor,
            ...(plan.markedRemovedIds.length > 0 ? { pendingRemovalIds: FieldValue.arrayUnion(...plan.markedRemovedIds) } : {}),
          });
        },
        completeLoop: (_state, updateStatus) => completeLoop(uid, itemId, syncingDocIds, legacy, updateStatus),
        isMutationError: (err) => getPlaidErrorCode(err) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
        now: () => Date.now(),
        onRestart: (attempt) => logWarn("sync", "Data changed during pagination; restarting the loop", { itemId, attempt }),
      }
    );

    await writeSyncSuccess(uid, itemId, item, {
      importStatus: loop.updateStatus ? importStatusOf(loop.updateStatus) : null,
      hasMore: loop.more,
      consentExpiresAt,
    });

    return { status: "synced", ...totals, more: loop.more, newAccounts: accounts.newAccounts };
  } finally {
    await releaseQuietly(itemRef, leaseId, "sync", itemId);
  }
}

/** Syncs one connection and records the outcome on its status doc. Never throws. */
export async function syncItemAndRecord(uid: string, itemId: string, deadline: number): Promise<ItemOutcome> {
  try {
    return await syncPlaidItem(uid, itemId, deadline);
  } catch (err) {
    // Disconnected since the sync was requested: nothing to sync or record.
    if (err instanceof ItemRemovedError) return { status: "removed" };
    // Another environment's connection: leave it, and its status, alone.
    if (err instanceof OtherEnvironmentError) return { status: "other_env" };

    const plaidCode = getPlaidErrorCode(err);
    const needsReauth = Boolean(plaidCode && REAUTH_CODES.has(plaidCode));
    const errorCode = plaidCode ?? "SYNC_FAILED";

    if (needsReauth) logWarn("sync", "Item needs the user to reconnect", { itemId, plaidErrorCode: errorCode });
    else logError("sync", err, { itemId });

    await writeSyncFailure(uid, itemId, errorCode, needsReauth).catch((writeErr: unknown) => {
      logWarn("sync", "Could not record sync failure", { itemId, ...errorFields(writeErr) });
    });
    return needsReauth ? { status: "needs_reauth" } : { status: "failed", errorCode };
  }
}

/**
 * Syncs every connection, or one, within the time budget. The connection
 * least recently started goes first, so a long import can't starve the others.
 * One failing connection never stops the rest.
 */
export async function syncAllPlaidItems(uid: string, options: { itemId?: string; deadline: number }): Promise<SyncAllResult> {
  let itemIds: string[];
  if (options.itemId) {
    itemIds = [options.itemId];
  } else {
    const snap = await plaidItemsCollection(uid).get();
    itemIds = snap.docs
      .map((d) => ({ id: d.id, startedAt: Number((d.data() as Partial<PlaidItemDoc>).lastSyncStartedAt ?? 0) }))
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((entry) => entry.id);
  }

  const total: SyncAllResult = {
    added: 0,
    modified: 0,
    removed: 0,
    more: false,
    newAccounts: [],
    itemsNeedingReauth: [],
    itemsFailed: [],
    itemsInProgress: [],
    itemsOtherEnv: [],
  };

  for (const itemId of itemIds) {
    if (Date.now() >= options.deadline) {
      total.more = true;
      break;
    }
    const outcome = await syncItemAndRecord(uid, itemId, options.deadline);
    switch (outcome.status) {
      case "synced":
        total.added += outcome.added;
        total.modified += outcome.modified;
        total.removed += outcome.removed;
        total.newAccounts.push(...outcome.newAccounts);
        if (outcome.more) total.more = true;
        break;
      case "needs_reauth":
        total.itemsNeedingReauth.push(itemId);
        break;
      case "failed":
        total.itemsFailed.push(itemId);
        break;
      case "in_progress":
        total.itemsInProgress.push(itemId);
        break;
      case "other_env":
        total.itemsOtherEnv.push(itemId);
        break;
      case "removed":
        break;
    }
  }

  return total;
}

// ---------------------------------------------------------------- other changes

export type RefreshResult = {
  refreshed: number;
  itemsNeedingReauth: string[];
  itemsFailed: string[];
  itemsOtherEnv: string[];
};

/**
 * Asks Plaid to check the bank for new transactions now (/transactions/refresh).
 * They arrive at a later sync; the browser polls while the refresh is recent.
 */
export async function refreshPlaidItems(uid: string, itemId?: string): Promise<RefreshResult> {
  const env = currentPlaidEnv();
  const snaps: DocumentSnapshot[] = itemId
    ? [await plaidItemsCollection(uid).doc(itemId).get()]
    : (await plaidItemsCollection(uid).get()).docs;
  const result: RefreshResult = { refreshed: 0, itemsNeedingReauth: [], itemsFailed: [], itemsOtherEnv: [] };

  for (const snap of snaps) {
    if (!snap.exists) continue;
    const item = snap.data() as PlaidItemDoc;
    if (isOtherPlaidEnv(item.plaidEnv, env)) {
      result.itemsOtherEnv.push(snap.id);
      continue;
    }
    try {
      await refreshTransactions(decryptSecretWithStatus(item.accessToken).plaintext);
      await writeStatus(uid, snap.id, { refreshRequestedAt: Date.now() });
      result.refreshed += 1;
    } catch (err) {
      const plaidCode = getPlaidErrorCode(err);
      if (plaidCode && REAUTH_CODES.has(plaidCode)) {
        result.itemsNeedingReauth.push(snap.id);
        await writeSyncFailure(uid, snap.id, plaidCode, true).catch(() => undefined);
      } else {
        logWarn("refresh", "Refresh request failed", { itemId: snap.id, ...errorFields(err) });
        result.itemsFailed.push(snap.id);
      }
    }
  }

  return result;
}

/**
 * Rebuild from Plaid: the next syncs re-import the connection's full history
 * from an empty cursor. Categories are kept, because transaction ids are
 * stable and a category is never overwritten; transactions Plaid no longer
 * has are deleted when the rebuild finishes.
 */
export async function startRebuild(uid: string, itemId: string): Promise<void> {
  const itemRef = plaidItemsCollection(uid).doc(itemId);
  const leaseId = await leaseForChange(itemRef);
  if (!leaseId) throw new ApiError(404, "not_found", "That bank connection no longer exists.");
  try {
    const now = Date.now();
    await itemRef.update({ cursor: "", loopStartCursor: "", pendingRemovalIds: [], rebuildStartedAt: now });
    await writeStatus(uid, itemId, { hasMore: true, rebuildRequestedAt: now });
  } finally {
    await releaseQuietly(itemRef, leaseId, "rebuild", itemId);
  }
}

/**
 * Revokes Plaid's access to a connection, deletes its records, and converts
 * its accounts to manual accounts (history kept, balance frozen). Their Plaid
 * details stay, so linking the bank again reattaches them. A connection that
 * is already gone still succeeds. Returns the number of accounts converted.
 * Throws SyncInProgressError or OtherEnvironmentError (409).
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

  const accounts = await accountsCollection(uid).where("plaidItemId", "==", itemId).get();
  const now = Date.now();
  const batch = db.batch();
  batch.delete(itemRef);
  batch.delete(plaidItemStatusCollection(uid).doc(itemId));
  accounts.docs.forEach((d) =>
    batch.update(d.ref, { isManual: true, plaidItemId: null, plaidAccountId: null, plaidClosed: false, updatedAt: now })
  );
  await batch.commit();

  return accounts.size;
}
