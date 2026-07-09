"use client";

import { db } from "@/lib/firebaseClient";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import type { Account, AccountType } from "../types/types";
import type { AuthUser } from "../types/types";

export function useAccounts(user: AuthUser | null, authLoading: boolean) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const addManualAccount = useCallback(
    async (payload: {
      name: string;
      accountType: AccountType;
      normalBalance: string;
      startingBalance?: number;
    }) => {
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
        plaidAccountId: null,
        plaidItemId: null,
        plaidInstitutionId: null,
        plaidInstitutionName: null,
        plaidMask: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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

  return { accounts, accountsLoading, error, addManualAccount, updateAccount, archiveAccount };
}

export default useAccounts;