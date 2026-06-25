"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, query, getDocs, orderBy } from "firebase/firestore";

export type Transaction = {
  id: string;
  name: string;
  merchantName?: string;
  logoUrl?: string;
  amount: number;
  date: string;
  paymentChannel: string;
  personalFinanceCategory?: {
    primary: string;
    detailed: string;
  };
  categoryIconUrl?: string;
};

export type AccountWithTransactions = {
  accountId: string;
  name: string; // Ensure your sync script writes the "accountName" field to the doc!
  transactions: Transaction[];
};

export default function useTransactions(user: any, authLoading: boolean) {
  const [accountsWithTransactions, setAccountsWithTransactions] = useState<AccountWithTransactions[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  const fetchFromFirebase = useCallback(async () => {
    if (authLoading || !user?.uid) return;

    setTransactionsLoading(true);
    setTransactionsError(null);

    try {
      const txCollectionRef = collection(db, "users", user.uid, "transactions");
      const q = query(txCollectionRef, orderBy("date", "desc"));
      const snapshot = await getDocs(q);

      const flatTransactions: any[] = [];
      snapshot.forEach((doc) => {
        flatTransactions.push({ id: doc.id, ...doc.data() });
      });

      const groupedMap: Record<string, AccountWithTransactions> = {};

      flatTransactions.forEach((tx) => {
        const accountId = tx.accountId || "manual_unlinked";
        const accountName = tx.accountName || "Unlinked Account"; // Ensure your sync script writes the "accountName" field to the doc!

        if (!groupedMap[accountId]) {
          groupedMap[accountId] = {
            accountId,
            name: accountName,
            transactions: [],
          };
        }

        // Map all your rich Plaid properties explicitly
        groupedMap[accountId].transactions.push({
          id: tx.id || tx.transaction_id,
          name: tx.merchantName || tx.merchant_name || tx.name || "Unknown Transaction",
          amount: tx.amount,
          date: tx.date,
          paymentChannel: tx.payment_channel || "other",
          logoUrl: tx.logo_url,
          categoryIconUrl: tx.personal_finance_category_icon_url,
          personalFinanceCategory: tx.personal_finance_category ? {
            primary: tx.personal_finance_category.primary,
            detailed: tx.personal_finance_category.detailed
          } : undefined
        });
      });

      setAccountsWithTransactions(Object.values(groupedMap));
    } catch (err: any) {
      console.error("Firebase read error:", err);
      setTransactionsError("Failed to fetch transaction logs.");
    } finally {
      setTransactionsLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchFromFirebase();
  }, [fetchFromFirebase]);

  return {
    accountsWithTransactions,
    transactionsLoading,
    transactionsError,
    setTransactionsError,
    refetchTransactions: fetchFromFirebase,
  };
}