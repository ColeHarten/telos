import type { AccountType, NormalBalance } from "@/lib/types/types";
import { incomingAccountKey, savedAccountKey, type IncomingAccount, type SavedAccount } from "./linkGate";

/**
 * Matches a connection's accounts at Plaid to Telos account docs. Runs at the
 * start of every sync, so accounts shared later (through Manage accounts) get
 * docs before their transactions arrive. Pure, so it can be unit tested;
 * syncService writes the result.
 */

export type PlaidAccountSnapshot = IncomingAccount & {
  officialName: string | null;
  accountType: AccountType;
  normalBalance: NormalBalance;
  current: number | null;
  available: number | null;
  limit: number | null;
};

export type ReconcileInput = {
  itemId: string;
  institutionId: string | null;
  /** Every account /accounts/get returned for the connection. */
  plaidAccounts: PlaidAccountSnapshot[];
  /** Every account doc the user has. */
  saved: SavedAccount[];
  /** Plaid accounts that never sync: deleted in Telos, or synced by another connection. */
  skippedPlaidAccountIds: ReadonlySet<string>;
};

export type ReconcilePlan = {
  /** Plaid account id -> account doc id, for every account that syncs. */
  docIdByPlaidId: Map<string, string>;
  /** Accounts with no doc yet. The new doc's id is the Plaid account id. */
  creates: PlaidAccountSnapshot[];
  /**
   * Existing docs that now stand for a different Plaid account id: a
   * disconnected bank linked again, or an account whose id changed. Their
   * transactions arrive again under new ids, so they need the carry-over pass.
   */
  reattached: { docId: string; account: PlaidAccountSnapshot }[];
  /** Docs already linked to their account. Balances are refreshed. */
  unchanged: { docId: string; account: PlaidAccountSnapshot }[];
  /** This connection's docs whose account is no longer shared. Kept and marked closed. */
  closed: string[];
  /** Docs marked closed whose account is shared again. */
  reopened: string[];
};

export function planAccountReconcile(input: ReconcileInput): ReconcilePlan {
  const { itemId, institutionId, plaidAccounts, saved, skippedPlaidAccountIds } = input;
  const plan: ReconcilePlan = {
    docIdByPlaidId: new Map(),
    creates: [],
    reattached: [],
    unchanged: [],
    closed: [],
    reopened: [],
  };

  const sharedIds = new Set(plaidAccounts.map((account) => account.plaidAccountId));
  const itemDocs = saved.filter((doc) => doc.plaidItemId === itemId);

  const docByPlaidId = new Map<string, SavedAccount>();
  for (const doc of itemDocs) {
    if (doc.plaidAccountId) docByPlaidId.set(doc.plaidAccountId, doc);
  }
  const docById = new Map<string, SavedAccount>();
  for (const doc of saved) docById.set(doc.id, doc);

  // Docs that could stand for an account Plaid now reports under a new id:
  // this connection's docs whose account disappeared, then disconnected docs
  // from the same bank.
  const orphans = itemDocs.filter((doc) => !doc.plaidAccountId || !sharedIds.has(doc.plaidAccountId));
  const disconnected = institutionId
    ? saved.filter((doc) => !doc.plaidItemId && doc.plaidInstitutionId === institutionId)
    : [];
  const used = new Set<string>();

  for (const account of plaidAccounts) {
    if (skippedPlaidAccountIds.has(account.plaidAccountId)) continue;

    const direct = docByPlaidId.get(account.plaidAccountId);
    if (direct) {
      used.add(direct.id);
      plan.docIdByPlaidId.set(account.plaidAccountId, direct.id);
      plan.unchanged.push({ docId: direct.id, account });
      if (direct.plaidClosed) plan.reopened.push(direct.id);
      continue;
    }

    const key = incomingAccountKey(account);
    const sameId = docById.get(account.plaidAccountId);
    const candidate =
      (sameId && !used.has(sameId.id) ? sameId : undefined) ??
      orphans.find((doc) => !used.has(doc.id) && savedAccountKey(doc) === key) ??
      disconnected.find((doc) => !used.has(doc.id) && savedAccountKey(doc) === key);

    if (candidate) {
      used.add(candidate.id);
      plan.docIdByPlaidId.set(account.plaidAccountId, candidate.id);
      plan.reattached.push({ docId: candidate.id, account });
      continue;
    }

    plan.docIdByPlaidId.set(account.plaidAccountId, account.plaidAccountId);
    plan.creates.push(account);
  }

  for (const doc of itemDocs) {
    if (used.has(doc.id) || doc.plaidClosed) continue;
    // Still shared but skipped: leave it alone.
    if (doc.plaidAccountId && sharedIds.has(doc.plaidAccountId)) continue;
    plan.closed.push(doc.id);
  }

  return plan;
}
