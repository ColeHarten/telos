"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import type { Account, AccountType } from "../types/types";
import type { AuthUser } from "../types/types";

export type AccountIsolationCheck = {
  isIsolated: boolean;
  reasons: string[];
  // Informational only — never blocks deletion. Deleting an account that's
  // still connected to Plaid also disconnects that bank link (see
  // deleteAccount), so the UI can warn the user about that without treating
  // it as something they need to fix first.
  hasActivePlaidConnection: boolean;
  // Informational only. Deleting an account also deletes its own transactions.
  hasTransactionHistory: boolean;
};

// Best-effort conversion of a Firestore-Timestamp-like value (or a raw
// epoch-ms number) into a JS Date. Mirrors the pattern already used for
// account.updatedAt in dashboard/page.tsx's formatRelativeSync.
function toDateOrNull(raw: unknown): Date | null {
  if (!raw) return null;
  const value = raw as { toDate?: () => Date; seconds?: number };
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof raw === "number") return new Date(raw);
  return null;
}

export function useAccounts(user: AuthUser | null, authLoading: boolean) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsNeedingReauth, setItemsNeedingReauth] = useState<Set<string>>(new Set());
  // Most recent lastSyncedAt across all of the user's plaidItemStatus docs, or
  // null if no item has ever completed a sync. Powers the "Last Synced"
  // card on the Transactions page — see syncService.ts's syncPlaidItem,
  // which is the only place lastSyncedAt is written.
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAccounts([]);
      setAccountsLoading(false);
      return;
    }

    setAccountsLoading(true);

    const accountsQuery = collection(db, "users", user.uid, "accounts");

    const unsubscribeAccounts = onSnapshot(
      accountsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((d) => {
          const data = d.data();

          return {
            id: d.id,
            name: data.name ?? "",
            accountType: (data.accountType ?? "cash") as AccountType,
            normalBalance: (data.normalBalance ?? "asset") as Account["normalBalance"],
            startingBalance:
              data.startingBalance === undefined ? undefined : Number(data.startingBalance),
            currentBalance:
              data.currentBalance === undefined ? undefined : Number(data.currentBalance),
            isManual: Boolean(data.isManual ?? true),
            isArchived: Boolean(data.isArchived ?? false),
            isContributionEligible: Boolean(data.isContributionEligible ?? false),
            plaidAccountId: data.plaidAccountId ?? null,
            plaidItemId: data.plaidItemId ?? null,
            plaidMask: data.plaidMask ?? null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } satisfies Account;
        });

        setAccounts(
          next.sort((a, b) => {
            // 1. Primary Sort: Account Type (should group assets and liabilities together)
            const typeCompare = a.accountType.localeCompare(b.accountType);

            // 2. Secondary Sort: Current Balance (Highest to Lowest)
            return typeCompare || (b.currentBalance ?? 0) - (a.currentBalance ?? 0);
          })
        );
        setAccountsLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load accounts.");
        setAccountsLoading(false);
      }
    );

    return () => {
      unsubscribeAccounts();
    };
  }, [authLoading, user]);

  // Live listener on plaidItemStatus: one doc per bank connection, written by
  // the sync job. needsReauth drives the reconnect prompt, and lastSyncedAt is
  // the most recent across connections.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setItemsNeedingReauth(new Set());
      setLastSyncedAt(null);
      return;
    }

    const itemsQuery = collection(db, "users", user.uid, "plaidItemStatus");

    const unsubscribeItems = onSnapshot(
      itemsQuery,
      (snapshot) => {
        const next = new Set<string>();
        let latestSyncedAt: Date | null = null;

        snapshot.docs.forEach((d) => {
          const data = d.data();
          if (data.needsReauth === true) next.add(d.id);

          const syncedAt = toDateOrNull(data.lastSyncedAt);
          if (syncedAt && (!latestSyncedAt || syncedAt > latestSyncedAt)) {
            latestSyncedAt = syncedAt;
          }
        });

        setItemsNeedingReauth(next);
        setLastSyncedAt(latestSyncedAt);
      },
      (err) => {
        // Non-fatal — reauth indicators and sync-status are supplementary;
        // don't block account loading if this listener fails.
        console.error("[useAccounts] Could not load plaid item status:", err);
      }
    );

    return () => {
      unsubscribeItems();
    };
  }, [authLoading, user]);

  const addManualAccount = useCallback(
    async (payload: {
      name: string;
      accountType: AccountType;
      normalBalance: string;
      startingBalance?: number;
      isContributionEligible?: boolean;
    }): Promise<string> => {
      if (!user) throw new Error("Not signed in");

      const ref = doc(collection(db, "users", user.uid, "accounts"));

      await setDoc(ref, {
        name: payload.name,
        accountType: payload.accountType,
        normalBalance: payload.normalBalance,
        startingBalance: payload.startingBalance ?? 0,
        currentBalance: payload.startingBalance ?? 0,
        isManual: true,
        isArchived: false,
        isContributionEligible: payload.isContributionEligible ?? false,
        plaidAccountId: null,
        plaidItemId: null,
        plaidInstitutionId: null,
        plaidInstitutionName: null,
        plaidMask: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return ref.id;
    },
    [user]
  );

  const updateAccount = useCallback(
    async (id: string, changes: Partial<Account>) => {
      if (!user) throw new Error("Not signed in");
      await updateDoc(doc(db, "users", user.uid, "accounts", id), {
        ...changes,
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  const archiveAccount = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not signed in");
      await updateDoc(doc(db, "users", user.uid, "accounts", id), {
        isArchived: true,
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  /**
   * Checks whether an account is fully isolated — no transaction history, no
   * transactions transferring into it, no category configured to transfer
   * into it, and no paycheck deduction contributing to it. Deletion should
   * never be allowed unless this comes back isolated; a "delete" that leaves
   * dangling references would corrupt budgets, transfers, and reports that
   * assume every categoryId/transferAccountId points at something real.
   *
   * A live Plaid connection is reported but never counted as a blocking
   * reason — deleteAccount handles disconnecting it as part of deletion.
   */
  const checkAccountIsolation = useCallback(
    async (accountId: string): Promise<AccountIsolationCheck> => {
      if (!user) throw new Error("Not signed in");
      const reasons: string[] = [];

      const target = accounts.find((a) => a.id === accountId);

      // Transactions that originated from this account.
      const originSnap = await getDocs(
        query(collection(db, "users", user.uid, "transactions"), where("accountId", "==", accountId), limit(1))
      );

      // Transactions categorized as a transfer into this account. Queried
      // by transferAccountId (the resolved destination account,
      // denormalized onto the transaction at assignment time) rather than
      // categoryId, so this still finds them even if the source transfer
      // Category has since been deleted (see reconcileContributionTransfers).
      const transferSnap = await getDocs(
        query(
          collection(db, "users", user.uid, "transactions"),
          where("transferAccountId", "==", accountId),
          limit(1)
        )
      );
      if (!transferSnap.empty) {
        reasons.push("Transactions are categorized as transfers to this account.");
      }

      // Categories (transfer categories, including paycheck-deduction-linked
      // ones) configured to send money into this account, and paycheck
      // deductions that contribute to it directly.
      const categoriesSnap = await getDocs(collection(db, "users", user.uid, "categories"));

      const linkedCategory = categoriesSnap.docs.find((d) => d.data().transferAccountId === accountId);
      if (linkedCategory) {
        reasons.push(`The category "${linkedCategory.data().name}" transfers into this account.`);
      }

      const linkedDeductionCategory = categoriesSnap.docs.find((d) => {
        const deductions = d.data().paycheckDetails?.deductions as { linkedAccountId?: string | null }[] | undefined;
        return deductions?.some((ded) => ded.linkedAccountId === accountId);
      });
      if (linkedDeductionCategory) {
        reasons.push(`A paycheck deduction on "${linkedDeductionCategory.data().name}" contributes to this account.`);
      }

      return {
        isIsolated: reasons.length === 0,
        reasons,
        hasActivePlaidConnection: Boolean(target?.plaidItemId),
        hasTransactionHistory: !originSnap.empty,
      };
    },
    [user, accounts]
  );

  /** Disconnects a bank. Its accounts become manual accounts that keep their history. */
  const disconnectBank = useCallback(async (plaidItemId: string) => {
    const res = await authenticatedFetch("/api/plaid/disconnect-item", {
      method: "POST",
      body: JSON.stringify({ itemId: plaidItemId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? body.error ?? "Could not disconnect the bank.");
    }
  }, []);

  /**
   * Permanently deletes an archived account and its own transactions. The
   * server re-checks that nothing else still links to it.
   */
  const deleteAccount = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not signed in");
      const res = await authenticatedFetch("/api/accounts/delete", {
        method: "POST",
        body: JSON.stringify({ accountId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "Could not delete this account.");
      }
    },
    [user]
  );

  return {
    accounts,
    accountsLoading,
    error,
    itemsNeedingReauth,
    lastSyncedAt,
    addManualAccount,
    updateAccount,
    archiveAccount,
    checkAccountIsolation,
    deleteAccount,
    disconnectBank,
  };
}

export default useAccounts;