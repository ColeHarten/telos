"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, onSnapshot, orderBy, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import type { Account, AccountType } from "../types/types";

export function useAccounts(user: any, authLoading: boolean) {
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
            accountType: (data.accountType ?? ("cash" as AccountType)) as AccountType,
            normalBalance: (data.normalBalance ?? "asset") as any,
            startingBalance: data.startingBalance === undefined ? undefined : Number(data.startingBalance),
            currentBalance: data.currentBalance === undefined ? undefined : Number(data.currentBalance),
            isManual: Boolean(data.isManual ?? true),
            isArchived: Boolean(data.isArchived ?? false),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Account;
        });

        setAccounts(next);
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

  async function addAccount(payload: { name: string; accountType: AccountType; normalBalance: string; startingBalance?: number; }) {
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function updateAccount(id: string, changes: Partial<Account>) {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "accounts", id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  async function archiveAccount(id: string) {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "accounts", id), {
      isArchived: true,
      updatedAt: serverTimestamp(),
    });
  }

  // Add this helper to the addAccount/update logic in useAccounts
async function addSyncedAccount(name: string, plaidItemId: string) {
  if (!user) throw new Error("Not signed in");
  const ref = doc(collection(db, "users", user.uid, "accounts"));
  await setDoc(ref, {
    name,
    accountType: "cash", // Or dynamically map from Plaid
    normalBalance: "asset",
    currentBalance: 0,
    isManual: false, // Key change: this is a synced account
    plaidItemId,
    isArchived: false,
    createdAt: serverTimestamp(),
  });
}
  return { accounts, accountsLoading, error, addAccount, updateAccount, archiveAccount, addSyncedAccount };
}

export default useAccounts;
