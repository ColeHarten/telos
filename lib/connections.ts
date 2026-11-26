import type { PlaidConnection, PlaidImportStatus } from "@/lib/types/types";

/**
 * Bank connection status as the browser sees it, from the plaidItemStatus docs
 * the sync job writes. Pure; `now` defaults to the current time.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** How long after linking (or a rebuild) Telos keeps checking for history. */
const IMPORT_WINDOW_MS = 2 * DAY_MS;
/** How long after Refresh from bank Telos keeps checking for new transactions. */
const REFRESH_WINDOW_MS = 10 * 60 * 1000;
/** Warn this many days before a bank's consent runs out. */
export const CONSENT_WARNING_DAYS = 14;
/** Data older than this is synced when Telos opens, and every half hour after that while it stays stale. */
const STALE_MS = 6 * HOUR_MS;
const STALE_RETRY_MS = 30 * 60 * 1000;
/** A sync that stopped part way (more to import) continues after this pause. */
const CONTINUE_AFTER_MS = 15 * 1000;
/** While a bank is importing history or refreshing, Telos syncs this often. */
const ACTIVE_POLL_MS = 2 * 60 * 1000;

const IMPORT_STATUSES: PlaidImportStatus[] = ["not_ready", "initial", "historical", "unknown"];

/** A Firestore Timestamp, epoch milliseconds, or an ISO string, as a Date. */
export function toDateOrNull(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? new Date(raw) : null;
  if (typeof raw === "string") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const value = raw as { toDate?: () => Date; seconds?: number };
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  return null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toPlaidConnection(itemId: string, data: Record<string, unknown>): PlaidConnection {
  const importStatus = IMPORT_STATUSES.find((status) => status === data.importStatus) ?? "unknown";
  return {
    itemId,
    institutionName: typeof data.institutionName === "string" && data.institutionName ? data.institutionName : null,
    plaidEnv: data.plaidEnv === "production" ? "production" : "sandbox",
    needsReauth: data.needsReauth === true,
    lastSyncedAt: toDateOrNull(data.lastSyncedAt),
    lastSyncError: typeof data.lastSyncError === "string" && data.lastSyncError ? data.lastSyncError : null,
    lastSyncErrorAt: toDateOrNull(data.lastSyncErrorAt),
    importStatus,
    hasMore: data.hasMore === true,
    linkedAt: numberOrNull(data.linkedAt),
    consentExpiresAt: toDateOrNull(data.consentExpiresAt),
    refreshRequestedAt: numberOrNull(data.refreshRequestedAt),
    rebuildRequestedAt: numberOrNull(data.rebuildRequestedAt),
  };
}

/** The last sync failed and nothing has succeeded since. */
export function isFailing(connection: PlaidConnection): boolean {
  if (!connection.lastSyncError) return false;
  if (!connection.lastSyncErrorAt || !connection.lastSyncedAt) return true;
  return connection.lastSyncErrorAt.getTime() >= connection.lastSyncedAt.getTime();
}

/** Plaid is still delivering this bank's history: recently linked or rebuilt, or a sync stopped part way. */
export function isImporting(connection: PlaidConnection, now: number = Date.now()): boolean {
  if (connection.needsReauth) return false;
  if (connection.hasMore) return true;
  if (connection.importStatus === "historical") return false;
  const startedAt = Math.max(connection.linkedAt ?? 0, connection.rebuildRequestedAt ?? 0);
  return startedAt > 0 && now - startedAt < IMPORT_WINDOW_MS;
}

/** Refresh from bank was used recently, so new transactions may still arrive. */
export function isRefreshing(connection: PlaidConnection, now: number = Date.now()): boolean {
  return connection.refreshRequestedAt !== null && now - connection.refreshRequestedAt < REFRESH_WINDOW_MS;
}

/** Whole days until the bank's consent runs out, or null if it doesn't expire. */
export function consentDaysLeft(connection: PlaidConnection, now: number = Date.now()): number | null {
  if (!connection.consentExpiresAt) return null;
  return Math.floor((connection.consentExpiresAt.getTime() - now) / DAY_MS);
}

export function isConsentExpiringSoon(connection: PlaidConnection, now: number = Date.now()): boolean {
  const days = consentDaysLeft(connection, now);
  return days !== null && days <= CONSENT_WARNING_DAYS;
}

/** Needs the user: sign in again, a failing sync, or consent about to run out. */
export function needsAttention(connection: PlaidConnection, now: number = Date.now()): boolean {
  return connection.needsReauth || isFailing(connection) || isConsentExpiringSoon(connection, now);
}

/** "just now", "5m ago", "3h ago", "2d ago", or "never". */
export function formatSyncAge(date: Date | null, now: number = Date.now()): string {
  if (!date) return "never";
  const minutes = Math.floor((now - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The oldest successful sync across connections: how current the data is as a whole. */
export function oldestSync(connections: PlaidConnection[]): Date | null {
  let oldest: Date | null = null;
  for (const connection of connections) {
    if (connection.lastSyncedAt && (!oldest || connection.lastSyncedAt < oldest)) oldest = connection.lastSyncedAt;
  }
  return oldest;
}

/** No successful sync yet, or none in the last six hours. */
export function isStale(connection: PlaidConnection, now: number = Date.now()): boolean {
  return !connection.lastSyncedAt || now - connection.lastSyncedAt.getTime() > STALE_MS;
}

/**
 * Whether the browser should sync now, given when it last did (0 if it hasn't
 * yet). Banks that need the user to sign in again are left alone, and a
 * failing bank is retried only once its data is stale.
 */
export function autoSyncDue(connections: PlaidConnection[], lastRunAt: number, now: number = Date.now()): boolean {
  const since = now - lastRunAt;
  const reachable = connections.filter((connection) => !connection.needsReauth);
  const healthy = reachable.filter((connection) => !isFailing(connection));

  if (since >= STALE_RETRY_MS && reachable.some((connection) => isStale(connection, now))) return true;
  if (since >= CONTINUE_AFTER_MS && healthy.some((connection) => connection.hasMore)) return true;
  if (since >= ACTIVE_POLL_MS && healthy.some((connection) => isImporting(connection, now) || isRefreshing(connection, now))) return true;
  return false;
}

/** One line for every bank under Last Synced: problems first, then an import still running. */
export function syncStatusCaption(
  connections: PlaidConnection[],
  now: number = Date.now()
): { text: string; attention: boolean } | null {
  const attention = connections.filter((connection) => needsAttention(connection, now)).length;
  if (attention > 0) return { text: attention === 1 ? "1 bank needs attention" : `${attention} banks need attention`, attention: true };
  if (connections.some((connection) => isImporting(connection, now))) return { text: "Importing history…", attention: false };
  return null;
}
