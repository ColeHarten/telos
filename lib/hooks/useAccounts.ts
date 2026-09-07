"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  deleteDoc,
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
};

export function useAccounts(user: AuthUser | null, authLoading: boolean) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsNeedingReauth, setItemsNeedingReauth] = useState<Set<string>>(new Set());

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

  // Separate, small live listener on plaidItems — needsReauth is set there
  // (by syncService.ts, when a sync hits ITEM_LOGIN_REQUIRED) and cleared
  // there automatically on the next successful sync of that item.
  // Kept on plaidItems rather than duplicated onto every Account doc under
  // that item, so there's exactly one place this flag can drift from —
  // account rows just look it up by plaidItemId.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setItemsNeedingReauth(new Set());
      return;
    }

    const itemsQuery = collection(db, "users", user.uid, "plaidItems");

    const unsubscribeItems = onSnapshot(
      itemsQuery,
      (snapshot) => {
        const next = new Set<string>();
        snapshot.docs.forEach((d) => {
          if (d.data().needsReauth === true) next.add(d.id);
        });
        setItemsNeedingReauth(next);
      },
      (err) => {
        // Non-fatal — reauth indicators are supplementary; don't block
        // account loading if this listener fails.
        console.error("[useAccounts] Could not load plaid item reauth status:", err);
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
      if (!originSnap.empty) {
        reasons.push("This account has transaction history.");
      }

      // Transactions categorized as a transfer into this account.
      const transferSnap = await getDocs(
        query(
          collection(db, "users", user.uid, "transactions"),
          where("categoryKind", "==", "transfer"),
          where("categoryId", "==", accountId),
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
      };
    },
    [user, accounts]
  );

  /**
   * If `plaidItemId` isn't referenced by any other account (any status,
   * excluding the one being deleted), tells the server to revoke Plaid's
   * access to it and delete the plaidItems doc. If another account still
   * shares this Item, does nothing — that account's connection must stay
   * alive.
   */
  const disconnectPlaidItemIfOrphaned = useCallback(
    async (plaidItemId: string, excludingAccountId: string) => {
      const stillInUse = accounts.some(
        (a) => a.id !== excludingAccountId && a.plaidItemId === plaidItemId
      );
      if (stillInUse) return;

      const res = await authenticatedFetch("/api/plaid/disconnect-item", {
        method: "POST",
        body: JSON.stringify({ itemId: plaidItemId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "Could not disconnect the linked bank account.");
      }
    },
    [accounts]
  );

  /**
   * Permanently deletes an account. Only ever succeeds for an archived,
   * fully-isolated account — re-verifies both here (not just in the UI)
   * since this is destructive and irreversible.
   *
   * If the account is still linked to Plaid, deletion also disconnects that
   * bank connection (unless a sibling account shares the same Item, in
   * which case only this account's doc is removed — see
   * disconnectPlaidItemIfOrphaned).
   */
  const deleteAccount = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not signed in");

      const target = accounts.find((a) => a.id === id);
      if (!target) throw new Error("Account not found.");
      if (!target.isArchived) {
        throw new Error("Only archived accounts can be permanently deleted.");
      }

      const { isIsolated, reasons } = await checkAccountIsolation(id);
      if (!isIsolated) {
        throw new Error(`This account can't be deleted yet: ${reasons.join(" ")}`);
      }

      if (target.plaidItemId) {
        await disconnectPlaidItemIfOrphaned(target.plaidItemId, id);
      }

      await deleteDoc(doc(db, "users", user.uid, "accounts", id));
    },
    [user, accounts, checkAccountIsolation, disconnectPlaidItemIfOrphaned]
  );

  return {
    accounts,
    accountsLoading,
    error,
    itemsNeedingReauth,
    addManualAccount,
    updateAccount,
    archiveAccount,
    checkAccountIsolation,
    deleteAccount,
  };
}

export default useAccounts;