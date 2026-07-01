"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import type { PersonalFinanceCategory } from "plaid";
import type { AuthUser, Account, Transaction } from "../types/types";

interface TransactionRecord {
  accountId: string;
  amount: number;
  date: string;
  merchantName: string | null;
  rawName: string;
  pending: boolean;
  category: PersonalFinanceCategory | null;
  cashflowId: string | null;
  createdAt: number;
  updatedAt: number;
}

function resolveDisplayName(tx: TransactionRecord): string {
  return tx.merchantName ?? tx.rawName;
}

function toTransaction(
  id: string,
  record: TransactionRecord,
  accountName: string
): Transaction {
  return {
    id,
    accountId: record.accountId,
    accountName,
    displayName: resolveDisplayName(record),
    amount: record.amount,
    date: record.date,
    pending: record.pending,
    categoryPrimary: record.category?.primary ?? null,
    categoryDetailed: record.category?.detailed ?? null,
    cashflowId: record.cashflowId,
  };
}

export default function useTransactions(
  user: AuthUser | null,
  authLoading: boolean,
  accounts: Account[]
) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  // O(1) id -> name lookups, only recomputed when the accounts list changes.
  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accounts) {
      map.set(acc.id, acc.name);
    }
    return map;
  }, [accounts]);

  const fetchFromFirebase = useCallback(async () => {
    if (authLoading || !user?.uid) return;

    setTransactionsLoading(true);
    setTransactionsError(null);

    try {
      const txCollectionRef = collection(db, "users", user.uid, "transactions");
      const q = query(txCollectionRef, orderBy("date", "desc"));
      const snapshot = await getDocs(q);

      const flattenedTransactions: Transaction[] = [];

      snapshot.forEach((doc) => {
        const record = doc.data() as TransactionRecord;
        const accountId = record.accountId || "unlinked";
        const accountName = accountNameById.get(accountId) ?? "Unlinked Account";

        flattenedTransactions.push(toTransaction(doc.id, record, accountName));
      });

      setTransactions(flattenedTransactions);
    } catch (err) {
      console.error("Firebase read error:", err);
      setTransactionsError("Failed to fetch transaction logs.");
    } finally {
      setTransactionsLoading(false);
    }
  }, [user, authLoading, accountNameById]);

  useEffect(() => {
    fetchFromFirebase();
  }, [fetchFromFirebase]);

  return {
    transactions,
    transactionsLoading,
    transactionsError,
    setTransactionsError,
    refetchTransactions: fetchFromFirebase,
  };
}