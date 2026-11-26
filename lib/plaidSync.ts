import { authenticatedFetch } from "@/lib/authenticatedFetch";

/**
 * Browser side of syncing. One sync request pages through Plaid for up to 40
 * seconds and reports `more` when a bank has more to import, so runSync calls
 * again until it's done.
 */

export type SyncedAccount = { id: string; name: string; accountType: string };

export type SyncSummary = {
  added: number;
  modified: number;
  removed: number;
  /** Accounts that got a doc during the sync, such as ones shared through Manage accounts. */
  newAccounts: SyncedAccount[];
  itemsNeedingReauth: string[];
  itemsFailed: string[];
  itemsInProgress: string[];
  itemsOtherEnv: string[];
  /** True when the last round still had more to import. */
  more: boolean;
};

export type PlaidUsage = { env: "sandbox" | "production"; used: number; limit: number };

// About seven minutes of importing per run; the auto-sync picks up the rest.
const MAX_ROUNDS = 10;

let running: Promise<SyncSummary> | null = null;
const runningListeners = new Set<() => void>();

function setRunning(next: Promise<SyncSummary> | null): void {
  running = next;
  for (const listener of runningListeners) listener();
}

/** Whether a sync is running in this tab (see useSyncRunning). */
export function isSyncRunning(): boolean {
  return running !== null;
}

export function subscribeSyncRunning(listener: () => void): () => void {
  runningListeners.add(listener);
  return () => {
    runningListeners.delete(listener);
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function accountList(value: unknown): SyncedAccount[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const account = entry as Partial<SyncedAccount> | null;
    return account && typeof account.id === "string" && typeof account.name === "string"
      ? [{ id: account.id, name: account.name, accountType: typeof account.accountType === "string" ? account.accountType : "" }]
      : [];
  });
}

async function postJson(path: string, body: Record<string, unknown>, fallback: string): Promise<Record<string, unknown>> {
  const res = await authenticatedFetch(path, { method: "POST", body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error(typeof data?.message === "string" && data.message ? data.message : fallback);
  return data ?? {};
}

async function syncRounds(itemId: string | undefined): Promise<SyncSummary> {
  const total: SyncSummary = {
    added: 0,
    modified: 0,
    removed: 0,
    newAccounts: [],
    itemsNeedingReauth: [],
    itemsFailed: [],
    itemsInProgress: [],
    itemsOtherEnv: [],
    more: false,
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body = await postJson("/api/plaid/sync", itemId ? { itemId } : {}, "Sync failed. Please try again.");
    total.added += Number(body.added) || 0;
    total.modified += Number(body.modified) || 0;
    total.removed += Number(body.removed) || 0;
    total.newAccounts.push(...accountList(body.newAccounts));
    // Problems are reported as of the latest round.
    total.itemsNeedingReauth = stringList(body.itemsNeedingReauth);
    total.itemsFailed = stringList(body.itemsFailed);
    total.itemsInProgress = stringList(body.itemsInProgress);
    total.itemsOtherEnv = stringList(body.itemsOtherEnv);
    total.more = body.more === true;
    if (!total.more) break;
  }

  return total;
}

/**
 * Syncs every bank, or one. A sync already running in this tab is joined
 * rather than repeated; afterCurrent queues a fresh one behind it instead,
 * for changes the running sync can't have seen (Manage accounts, a rebuild).
 */
export function runSync(itemId?: string, options: { afterCurrent?: boolean } = {}): Promise<SyncSummary> {
  if (running && !options.afterCurrent) return running;
  const previous: Promise<unknown> = running ?? Promise.resolve();
  const run: Promise<SyncSummary> = previous
    .catch(() => undefined)
    .then(() => syncRounds(itemId))
    .finally(() => {
      if (running === run) setRunning(null);
    });
  setRunning(run);
  return run;
}

export type RefreshSummary = { refreshed: number; itemsNeedingReauth: string[]; itemsFailed: string[] };

/**
 * Asks the bank for new transactions now. Whatever has already arrived syncs
 * right away; the rest arrives at the syncs that follow (see useAutoSync).
 */
export async function refreshFromBank(itemId?: string): Promise<RefreshSummary> {
  const body = await postJson("/api/plaid/refresh", itemId ? { itemId } : {}, "Could not ask the bank for new transactions.");
  void runSync(itemId).catch((error: unknown) => console.error(error));
  return {
    refreshed: Number(body.refreshed) || 0,
    itemsNeedingReauth: stringList(body.itemsNeedingReauth),
    itemsFailed: stringList(body.itemsFailed),
  };
}

/** Re-imports a bank's full history from Plaid without linking it again. The import runs in the background. */
export async function rebuildFromPlaid(itemId: string): Promise<void> {
  await postJson("/api/plaid/rebuild", { itemId }, "Could not start the rebuild.");
  void runSync(itemId, { afterCurrent: true }).catch((error: unknown) => console.error(error));
}

/** Connections created in this Plaid environment, across all users, and the plan's limit. */
export async function fetchPlaidUsage(): Promise<PlaidUsage> {
  const res = await authenticatedFetch("/api/plaid/usage");
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) throw new Error("Could not load connection usage.");
  return {
    env: data.env === "production" ? "production" : "sandbox",
    used: Number(data.used) || 0,
    limit: Number(data.limit) || 10,
  };
}
