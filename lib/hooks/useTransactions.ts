"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, query, getDocs, orderBy, doc, updateDoc } from "firebase/firestore";
import type { PersonalFinanceCategory } from "plaid";
import type { AuthUser, Account, Transaction, CategoryKind } from "../types/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDisplayName(merchantName: string | null, rawName: string): string {
  return merchantName ?? rawName;
}

/**
 * Reconciles the raw assignment fields read from Firestore into a valid
 * (assignmentType, assignmentId) pair.
 *
 * This is a *soft* check — Firestore data isn't fully under our control (a
 * bad write, manual console edits), so rather than throwing and taking down
 * the whole transaction list over one bad doc, an inconsistent record is
 * logged and coerced to unassigned (both fields undefined).
 */
function normalizeAssignment(
  rawType: unknown,
  rawId: unknown,
  context: string
): { categoryKind: CategoryKind | undefined; categoryId: string | undefined } {
  const categoryKind = (typeof rawType === "string" ? rawType : undefined) as CategoryKind | undefined;
  const categoryId = typeof rawId === "string" && rawId.length > 0 ? rawId : undefined;

  const hasId = Boolean(categoryId);
  const isConsistent = (!categoryKind && !hasId) || (!!categoryKind && hasId);

  if (!isConsistent) {
    console.warn(
      `[useTransactions] Inconsistent assignment for ${context}: type="${categoryKind}", id="${categoryId ?? "none"}". Falling back to unassigned.`
    );
    return { categoryKind: undefined, categoryId: undefined };
  }

  return { categoryKind, categoryId };
}

/**
 * Strict invariant check used before writing an assignment. Unlike
 * normalizeAssignment, this throws — an invalid combination reaching this
 * point means the caller (our own UI code) has a bug, not that Firestore has
 * bad data, so it should fail loudly during development.
 */
function assertValidAssignment(categoryKind: CategoryKind | undefined, categoryId: string | undefined, originAccId: string): void {
  if (!categoryKind) {
    if (categoryId) {
      throw new Error(`Invalid assignment: type is "undefined" but categoryId ("${categoryId}") was provided.`);
    }
    return;
  }

  if (!categoryId) {
    throw new Error(`Invalid assignment: type is "${categoryKind}" but no categoryId was provided.`);
  }

  if (categoryKind === "transfer" && categoryId === originAccId) {
    throw new Error(`Invalid assignment: cannot mark a transaction as a transfer to its own origin account ("${originAccId}").`);
  }
}

// Inline shape of a transaction doc's raw fields — intentionally not a named
// type, since it's only ever used at this one read site.
function toTransaction(
  id: string,
  data: {
    accountId?: string;
    amount?: number;
    date?: string;
    merchantName?: string | null;
    rawName?: string;
    pending?: boolean;
    category?: PersonalFinanceCategory | null;
    categoryKind?: CategoryKind | undefined;
    categoryId?: string | undefined;
  },
  accountName: string
): Transaction {
  const originAccId = data.accountId || "unlinked";
  const { categoryKind, categoryId } = normalizeAssignment(
    data.categoryKind,
    data.categoryId,
    `transaction ${id}`
  );

  return {
    id,
    originAccId,
    originAccName: accountName,
    displayName: resolveDisplayName(data.merchantName ?? null, data.rawName ?? ""),
    amount: data.amount ?? 0,
    date: data.date ?? "",
    pending: Boolean(data.pending),
    plaidCategoryPrimary: data.category?.primary ?? null,
    plaidCategoryDetailed: data.category?.detailed ?? null,
    categoryKind,
    categoryId,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useTransactions(user: AuthUser | null, authLoading: boolean, accounts: Account[]) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

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

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Parameters<typeof toTransaction>[1];
        const accountId = data.accountId || "unlinked";
        const accountName = accountNameById.get(accountId) ?? "Unlinked Account";

        const tx = toTransaction(docSnap.id, data, accountName);

        // Soft warning only — a "transaction" (account transfer) assignment
        // pointing at an account we don't know about shouldn't block
        // rendering the rest of the list.
        if (tx.categoryKind === "transfer" && tx.categoryId && !accountNameById.has(tx.categoryId)) {
          console.warn(`[useTransactions] Transaction ${tx.id} transfers to unknown account "${tx.categoryId}".`);
        }

        flattenedTransactions.push(tx);
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

  /**
   * Assigns a transaction to a category (income/expense), or to an account
   * transfer ("transaction" kind), or clears the assignment entirely by
   * passing assignmentType/assignmentId as undefined.
   *
   * Optimistically updates local state so the UI reflects the change
   * instantly; reverts via the previous snapshot if the write fails.
   *
   * categoryId is required unless categoryKind is undefined — this is
   * enforced by assertValidAssignment before anything is written.
   */
  const updateTransactionAssignment = useCallback(
    async (transactionId: string, categoryKind: CategoryKind | undefined, categoryId?: string) => {
      if (!user?.uid) return;

      const target = transactions.find((tx) => tx.id === transactionId);
      if (!target) {
        console.error(`[useTransactions] updateTransactionAssignment: no transaction found with id "${transactionId}".`);
        setTransactionsError("Could not find that transaction.");
        return;
      }

      try {
        assertValidAssignment(categoryKind, categoryId, target.originAccId);
      } catch (err) {
        console.error("[useTransactions] Invalid assignment:", err);
        setTransactionsError(err instanceof Error ? err.message : "Invalid assignment.");
        return;
      }

      const previous = transactions;
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === transactionId ? { ...tx, categoryKind, categoryId } : tx))
      );

      try {
        const txRef = doc(db, "users", user.uid, "transactions", transactionId);
        await updateDoc(txRef, {
          // Firestore rejects `undefined` field values — write `null` to
          // explicitly clear the fields when unassigning. The in-memory
          // Transaction type keeps them as `undefined`; only the Firestore
          // write layer needs the `null` translation.
          categoryKind: categoryKind ?? null,
          categoryId: categoryId ?? null,
          updatedAt: Date.now(),
        });
      } catch (err) {
        console.error("Failed to update assignment:", err);
        setTransactionsError("Failed to update assignment.");
        setTransactions(previous); // revert optimistic update
      }
    },
    [user, transactions]
  );

  return {
    transactions,
    transactionsLoading,
    transactionsError,
    setTransactionsError,
    refetchTransactions: fetchFromFirebase,
    updateTransactionAssignment,
  };
}