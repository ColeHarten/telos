"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTransactionsStore } from "@/components/TransactionsProvider";
import { db } from "@/lib/firebaseClient";
import { monthsSince } from "@/lib/transactionDocs";
import { doc, increment, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import type { AuthUser, Account, Transaction, CategoryKind } from "../types/types";

/**
 * Strict invariant check used before writing an assignment. An invalid
 * combination reaching this point means our own UI code has a bug, so it
 * fails loudly.
 *
 * transferAccountId is validated against the transaction's own origin
 * account: a transfer to the account it came from is meaningless.
 */
function assertValidAssignment(
  categoryKind: CategoryKind | undefined,
  categoryId: string | undefined,
  transferAccountId: string | null,
  originAccId: string
): void {
  if (!categoryKind) {
    if (categoryId) {
      throw new Error(`Invalid assignment: type is "undefined" but categoryId ("${categoryId}") was provided.`);
    }
    return;
  }

  if (!categoryId) {
    throw new Error(`Invalid assignment: type is "${categoryKind}" but no categoryId was provided.`);
  }

  if (categoryKind === "transfer") {
    if (!transferAccountId) {
      throw new Error(
        `Invalid assignment: type is "transfer" but no destination account could be resolved for categoryId ("${categoryId}").`
      );
    }
    if (transferAccountId === originAccId) {
      throw new Error(`Invalid assignment: cannot mark a transaction as a transfer to its own origin account ("${originAccId}").`);
    }
  }
}

/**
 * Transactions from the session's shared listener (see TransactionsProvider),
 * with account names joined in. The last 24 months load first, plus 12 more
 * per "load older". sinceMonthKey widens the window so that month is always
 * covered, which the Budgets page and Dashboard use for the month on screen.
 */
export default function useTransactions(
  user: AuthUser | null,
  authLoading: boolean,
  accounts: Account[],
  sinceMonthKey?: string
) {
  const store = useTransactionsStore();
  const { ensureMonths } = store;
  const neededMonths = monthsSince(sinceMonthKey);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    ensureMonths(neededMonths);
  }, [ensureMonths, neededMonths]);

  const rawTransactions = store.items;
  // Until the window covers the month on screen, its totals would be wrong.
  const transactionsLoading = authLoading || store.loading || neededMonths > store.months;
  const transactionsError = actionError ?? store.error;

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accounts) {
      map.set(acc.id, acc.name);
    }
    return map;
  }, [accounts]);

  // Account names are joined in memory, so an accounts update never re-reads transactions.
  const transactions = useMemo<Transaction[]>(() => {
    return rawTransactions.map((tx) => {
      const originAccName = accountNameById.get(tx.originAccId) ?? "Unlinked Account";

      // Soft warning only: a transfer to an unknown account shouldn't block the list.
      if (tx.categoryKind === "transfer" && tx.transferAccountId && !accountNameById.has(tx.transferAccountId)) {
        console.warn(`[useTransactions] Transaction ${tx.id} transfers to unknown account "${tx.transferAccountId}".`);
      }

      return { ...tx, originAccName };
    });
  }, [rawTransactions, accountNameById]);

  /**
   * Records one learning vote: transactions with this Plaid `detailed` code
   * belong in this category. Best-effort; a failed write never affects the
   * categorization itself.
   */
  const recordCategorySignal = useCallback(
    async (plaidDetailedCode: string, categoryId: string) => {
      if (!user?.uid) return;
      try {
        const statsRef = doc(db, "users", user.uid, "categoryPlaidStats", plaidDetailedCode);
        // A nested map, not a dotted key: setDoc treats "counts.<id>" as a
        // literal field name, which the server never read.
        await setDoc(
          statsRef,
          { counts: { [categoryId]: increment(1) }, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        console.error("[useTransactions] Failed to record category signal:", err);
      }
    },
    [user]
  );

  /**
   * Assigns a transaction to a category, or clears the assignment when
   * categoryKind is undefined. For a "transfer" category, transferAccountId is
   * the destination account, stored on the transaction so totals and the
   * account-deletion check still work if the category is later deleted.
   *
   * The live listener shows the change immediately and reverts it if the
   * write is rejected. A genuine correction also records a learning vote.
   * Returns whether the change was saved.
   */
  const updateTransactionAssignment = useCallback(
    async (
      transactionId: string,
      categoryKind: CategoryKind | undefined,
      categoryId?: string,
      transferAccountId?: string | null
    ): Promise<boolean> => {
      if (!user?.uid) return false;

      const target = rawTransactions.find((tx) => tx.id === transactionId);
      if (!target) {
        console.error(`[useTransactions] updateTransactionAssignment: no transaction found with id "${transactionId}".`);
        setActionError("Could not find that transaction.");
        return false;
      }

      const normalizedTransferAccountId = categoryKind === "transfer" ? transferAccountId ?? null : null;

      try {
        assertValidAssignment(categoryKind, categoryId, normalizedTransferAccountId, target.originAccId);
      } catch (err) {
        console.error("[useTransactions] Invalid assignment:", err);
        setActionError(err instanceof Error ? err.message : "Invalid assignment.");
        return false;
      }

      try {
        await updateDoc(doc(db, "users", user.uid, "transactions", transactionId), {
          // Firestore can't store undefined; null clears the fields.
          categoryKind: categoryKind ?? null,
          categoryId: categoryId ?? null,
          transferAccountId: normalizedTransferAccountId,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to update assignment:", err);
        setActionError("Failed to update assignment.");
        return false;
      }

      // Vote only for a real category that differs from before, on a
      // transaction with a Plaid code to learn from.
      const isRealAssignment = Boolean(categoryKind) && Boolean(categoryId);
      const isActuallyDifferent = target.categoryKind !== categoryKind || target.categoryId !== categoryId;
      if (isRealAssignment && isActuallyDifferent && target.plaidCategoryDetailed && categoryId) {
        void recordCategorySignal(target.plaidCategoryDetailed, categoryId);
      }
      return true;
    },
    [user, rawTransactions, recordCategorySignal]
  );

  return {
    transactions,
    transactionsLoading,
    transactionsError,
    setTransactionsError: setActionError,
    hasOlderTransactions: store.hasOlder,
    loadOlderTransactions: store.loadOlder,
    updateTransactionAssignment,
  };
}
