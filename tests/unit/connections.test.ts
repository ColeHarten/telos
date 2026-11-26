import { describe, expect, it } from "vitest";
import {
  autoSyncDue,
  consentDaysLeft,
  formatSyncAge,
  isConsentExpiringSoon,
  isFailing,
  isImporting,
  needsAttention,
  oldestSync,
  syncStatusCaption,
  toPlaidConnection,
} from "@/lib/connections";
import type { PlaidConnection } from "@/lib/types/types";

const NOW = Date.UTC(2026, 10, 25, 12);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function connection(overrides: Partial<PlaidConnection> = {}): PlaidConnection {
  return {
    itemId: "item-1",
    institutionName: "Chase",
    plaidEnv: "production",
    needsReauth: false,
    lastSyncedAt: new Date(NOW - 5 * MINUTE),
    lastSyncError: null,
    lastSyncErrorAt: null,
    importStatus: "historical",
    hasMore: false,
    linkedAt: NOW - 10 * DAY,
    consentExpiresAt: null,
    refreshRequestedAt: null,
    rebuildRequestedAt: null,
    ...overrides,
  };
}

const failing = { lastSyncError: "INTERNAL_SERVER_ERROR", lastSyncErrorAt: new Date(NOW - MINUTE) };

describe("toPlaidConnection", () => {
  it("reads a status doc", () => {
    const result = toPlaidConnection("item-1", {
      institutionName: "Chase",
      plaidEnv: "production",
      needsReauth: true,
      lastSyncedAt: { toDate: () => new Date(NOW) },
      importStatus: "initial",
      hasMore: true,
      linkedAt: NOW,
      consentExpiresAt: "2027-01-01T00:00:00Z",
    });
    expect(result).toMatchObject({
      institutionName: "Chase",
      plaidEnv: "production",
      needsReauth: true,
      lastSyncedAt: new Date(NOW),
      importStatus: "initial",
      hasMore: true,
      linkedAt: NOW,
      consentExpiresAt: new Date("2027-01-01T00:00:00Z"),
    });
  });

  it("fills in defaults for missing fields", () => {
    expect(toPlaidConnection("item-2", {})).toMatchObject({
      institutionName: null,
      plaidEnv: "sandbox",
      needsReauth: false,
      lastSyncedAt: null,
      importStatus: "unknown",
      hasMore: false,
      linkedAt: null,
    });
  });
});

describe("connection status", () => {
  it("is failing until a sync succeeds after the error", () => {
    expect(isFailing(connection(failing))).toBe(true);
    expect(isFailing(connection({ ...failing, lastSyncedAt: new Date(NOW) }))).toBe(false);
    expect(isFailing(connection({ ...failing, lastSyncedAt: null }))).toBe(true);
    expect(isFailing(connection())).toBe(false);
  });

  it("is importing while a sync has more, or soon after linking until history is complete", () => {
    expect(isImporting(connection({ hasMore: true }), NOW)).toBe(true);
    expect(isImporting(connection({ linkedAt: NOW - HOUR, importStatus: "initial" }), NOW)).toBe(true);
    expect(isImporting(connection({ linkedAt: NOW - HOUR, importStatus: "historical" }), NOW)).toBe(false);
    expect(isImporting(connection({ linkedAt: NOW - 3 * DAY, importStatus: "initial" }), NOW)).toBe(false);
    expect(isImporting(connection({ rebuildRequestedAt: NOW - HOUR, importStatus: "unknown" }), NOW)).toBe(true);
    expect(isImporting(connection({ hasMore: true, needsReauth: true }), NOW)).toBe(false);
  });

  it("warns two weeks before consent runs out", () => {
    const soon = connection({ consentExpiresAt: new Date(NOW + 10 * DAY) });
    expect(consentDaysLeft(soon, NOW)).toBe(10);
    expect(isConsentExpiringSoon(soon, NOW)).toBe(true);
    expect(isConsentExpiringSoon(connection({ consentExpiresAt: new Date(NOW + 30 * DAY) }), NOW)).toBe(false);
    expect(isConsentExpiringSoon(connection(), NOW)).toBe(false);
  });

  it("needs attention when it needs a login, is failing, or is about to lose consent", () => {
    expect(needsAttention(connection({ needsReauth: true }), NOW)).toBe(true);
    expect(needsAttention(connection(failing), NOW)).toBe(true);
    expect(needsAttention(connection({ consentExpiresAt: new Date(NOW + DAY) }), NOW)).toBe(true);
    expect(needsAttention(connection(), NOW)).toBe(false);
  });

  it("formats how long ago a sync was", () => {
    expect(formatSyncAge(null, NOW)).toBe("never");
    expect(formatSyncAge(new Date(NOW - 30 * SECOND), NOW)).toBe("just now");
    expect(formatSyncAge(new Date(NOW - 5 * MINUTE), NOW)).toBe("5m ago");
    expect(formatSyncAge(new Date(NOW - 3 * HOUR), NOW)).toBe("3h ago");
    expect(formatSyncAge(new Date(NOW - 2 * DAY), NOW)).toBe("2d ago");
  });

  it("reports the bank synced longest ago, ignoring banks that never synced", () => {
    const old = new Date(NOW - 3 * HOUR);
    expect(oldestSync([connection(), connection({ lastSyncedAt: old }), connection({ lastSyncedAt: null })])).toEqual(old);
    expect(oldestSync([])).toBeNull();
  });

  it("sums up every bank under Last Synced", () => {
    expect(syncStatusCaption([connection({ needsReauth: true }), connection(failing)], NOW)).toEqual({
      text: "2 banks need attention",
      attention: true,
    });
    expect(syncStatusCaption([connection({ hasMore: true })], NOW)).toEqual({ text: "Importing history\u2026", attention: false });
    expect(syncStatusCaption([connection()], NOW)).toBeNull();
  });
});

describe("autoSyncDue", () => {
  it("syncs on open when the data is more than six hours old", () => {
    expect(autoSyncDue([connection({ lastSyncedAt: new Date(NOW - 7 * HOUR) })], 0, NOW)).toBe(true);
    expect(autoSyncDue([connection({ lastSyncedAt: null })], 0, NOW)).toBe(true);
    expect(autoSyncDue([connection()], 0, NOW)).toBe(false);
  });

  it("continues an import 15 seconds after the last run", () => {
    const importing = [connection({ hasMore: true })];
    expect(autoSyncDue(importing, NOW - 20 * SECOND, NOW)).toBe(true);
    expect(autoSyncDue(importing, NOW - 5 * SECOND, NOW)).toBe(false);
  });

  it("checks every two minutes while history is arriving", () => {
    const importing = [connection({ linkedAt: NOW - HOUR, importStatus: "initial" })];
    expect(autoSyncDue(importing, NOW - 3 * MINUTE, NOW)).toBe(true);
    expect(autoSyncDue(importing, NOW - MINUTE, NOW)).toBe(false);
    expect(autoSyncDue([connection({ refreshRequestedAt: NOW - MINUTE })], NOW - 3 * MINUTE, NOW)).toBe(true);
  });

  it("leaves banks that need a new login alone", () => {
    expect(autoSyncDue([connection({ needsReauth: true, lastSyncedAt: null, hasMore: true })], 0, NOW)).toBe(false);
  });

  it("retries a failing bank only once its data is stale, at most every half hour", () => {
    const stale = connection({ ...failing, lastSyncedAt: new Date(NOW - 7 * HOUR), hasMore: true });
    expect(autoSyncDue([stale], NOW - 10 * MINUTE, NOW)).toBe(false);
    expect(autoSyncDue([stale], NOW - 31 * MINUTE, NOW)).toBe(true);
    expect(autoSyncDue([connection({ ...failing, hasMore: true })], NOW - 20 * SECOND, NOW)).toBe(false);
  });
});
