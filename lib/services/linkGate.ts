import type { AccountType } from "@/lib/types/types";

/**
 * Duplicate checks for bank links. assessLink runs before the public token is
 * exchanged, because the exchange is what uses up one of Plaid's connections:
 * a duplicate has to be caught before it, not after. Pure, so it can be unit
 * tested.
 */

/** An account as Link's onSuccess metadata or /accounts/get describes it. */
export type IncomingAccount = {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  /** Plaid's account type: depository, credit, loan, investment, and so on. */
  type: string;
  subtype: string | null;
};

/** The fields of a saved account doc the checks use. */
export type SavedAccount = {
  id: string;
  name: string;
  accountType: AccountType;
  isArchived: boolean;
  plaidItemId: string | null;
  plaidAccountId: string | null;
  plaidInstitutionId: string | null;
  plaidMask: string | null;
  plaidType: string | null;
  plaidName: string | null;
  plaidClosed: boolean;
};

/** A saved connection, without its access token. */
export type SavedItem = { itemId: string; institutionId: string | null; institutionName: string | null };

export type LinkAssessment =
  | { outcome: "allow" }
  | { outcome: "refuse"; code: "duplicate_item" | "duplicate_accounts"; itemId: string; message: string }
  | { outcome: "confirm"; code: "same_institution"; itemId: string; message: string };

// For docs saved before plaidType was stored, the Telos type stands in.
const ACCOUNT_TYPE_FAMILY: Record<AccountType, string> = {
  cash: "depository",
  credit_card: "credit",
  loan: "loan",
  investment: "investment",
  retirement: "investment",
  property: "other",
  crypto: "other",
  other_asset: "other",
  other_liability: "other",
};

/** Groups Plaid's account types the way accounts are compared. Brokerage counts as investment. */
export function plaidTypeFamily(type: string | null | undefined): string {
  const value = (type ?? "").toLowerCase();
  if (value === "brokerage") return "investment";
  if (value === "depository" || value === "credit" || value === "loan" || value === "investment") return value;
  return "other";
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function keyOf(family: string, mask: string | null | undefined, name: string): string {
  const trimmedMask = mask?.trim();
  return trimmedMask ? `${family}|mask|${trimmedMask}` : `${family}|name|${normalizeName(name)}`;
}

/** Identifies an account within one bank: its type and last four digits, or its type and name when there's no mask. */
export function incomingAccountKey(account: IncomingAccount): string {
  return keyOf(plaidTypeFamily(account.type), account.mask, account.name);
}

/** The same key for a saved account, from what Plaid called it rather than what the user renamed it to. */
export function savedAccountKey(account: SavedAccount): string {
  const family = account.plaidType
    ? plaidTypeFamily(account.plaidType)
    : ACCOUNT_TYPE_FAMILY[account.accountType] ?? "other";
  return keyOf(family, account.plaidMask, account.plaidName ?? account.name);
}

/**
 * Decides whether a new link may be exchanged.
 *
 * - Every account is already synced by a connection to this bank: refused.
 *   The user should use Manage accounts or Reconnect on that connection.
 * - Some accounts are: refused. It's almost certainly the same login, and a
 *   second connection with the same login can break the first at some banks.
 * - None are, but the bank is already connected: asks the user to confirm
 *   it's a different login (a joint or business login, for example).
 * - Otherwise allowed, including a bank that was disconnected earlier, whose
 *   old accounts are reattached after the exchange.
 */
export function assessLink(
  incoming: { institutionId: string | null; institutionName: string | null; accounts: IncomingAccount[] },
  saved: { accounts: SavedAccount[]; items: SavedItem[] },
  confirmedDifferentLogin: boolean
): LinkAssessment {
  if (!incoming.institutionId) return { outcome: "allow" };

  const items = saved.items.filter((item) => item.institutionId === incoming.institutionId);
  if (items.length === 0) return { outcome: "allow" };

  const itemIds = new Set(items.map((item) => item.itemId));
  const linkedByKey = new Map<string, SavedAccount>();
  for (const account of saved.accounts) {
    if (account.plaidItemId && itemIds.has(account.plaidItemId)) linkedByKey.set(savedAccountKey(account), account);
  }

  const matches: SavedAccount[] = [];
  for (const account of incoming.accounts) {
    const match = linkedByKey.get(incomingAccountKey(account));
    if (match) matches.push(match);
  }

  const bank = incoming.institutionName ?? items[0].institutionName ?? "this bank";
  const itemId = matches[0]?.plaidItemId ?? items[0].itemId;

  if (incoming.accounts.length > 0 && matches.length === incoming.accounts.length) {
    const message = matches.some((account) => account.isArchived)
      ? `These accounts are already connected through ${bank}, and at least one of them is archived. Restore it on the Accounts page instead.`
      : `These accounts are already connected through ${bank}. Use Manage accounts on its card to add or remove accounts, or Reconnect if it needs you to sign in again.`;
    return { outcome: "refuse", code: "duplicate_item", itemId, message };
  }

  if (matches.length > 0) {
    return {
      outcome: "refuse",
      code: "duplicate_accounts",
      itemId,
      message: `Some of these accounts are already connected through ${bank}. Connecting the same login twice can break the first connection, so use Manage accounts on its card to add the others.`,
    };
  }

  if (!confirmedDifferentLogin) {
    return {
      outcome: "confirm",
      code: "same_institution",
      itemId,
      message: `You already have a ${bank} connection. To add accounts from that login, use Manage accounts on its card instead. Continue only if this is a different login, such as a joint or business login.`,
    };
  }

  return { outcome: "allow" };
}

/**
 * After an exchange, with Plaid's own account list: the accounts another live
 * connection to the same bank already syncs. They are skipped, not imported twice.
 */
export function findLinkedDuplicates(
  institutionId: string | null,
  accounts: IncomingAccount[],
  saved: SavedAccount[],
  newItemId: string
): IncomingAccount[] {
  if (!institutionId) return [];
  const keys = new Set<string>();
  for (const account of saved) {
    if (account.plaidItemId && account.plaidItemId !== newItemId && account.plaidInstitutionId === institutionId) {
      keys.add(savedAccountKey(account));
    }
  }
  return accounts.filter((account) => keys.has(incomingAccountKey(account)));
}
