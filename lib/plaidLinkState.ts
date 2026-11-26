/**
 * OAuth banks (Chase, Capital One, and others) send the user away from Telos
 * and back to /oauth, where Link has to reopen with the same link token. The
 * token is kept in localStorage until Link finishes or closes.
 */

const STORAGE_KEY = "telos.plaidLinkSession";
// Link tokens are valid for four hours.
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

export type SavedLinkSession = {
  token: string;
  /** Set for update mode (Reconnect or Manage accounts). */
  updateModeItemId: string | null;
  accountSelection: boolean;
  savedAt: number;
};

export function saveLinkSession(session: Omit<SavedLinkSession, "savedAt">): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    // Storage unavailable (private mode): OAuth banks can't resume, everything else works.
  }
}

export function readLinkSession(): SavedLinkSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedLinkSession>;
    if (typeof value.token !== "string" || typeof value.savedAt !== "number") return null;
    if (Date.now() - value.savedAt > MAX_AGE_MS) return null;
    return {
      token: value.token,
      updateModeItemId: typeof value.updateModeItemId === "string" ? value.updateModeItemId : null,
      accountSelection: value.accountSelection === true,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearLinkSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
