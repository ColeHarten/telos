"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTransactionsStore } from "@/components/TransactionsProvider";
import { db } from "@/lib/firebaseClient";
import { merchantKey, nextMemory, parseMemory, transactionInput, type TransactionUpdate } from "@/lib/categorization";
import { monthsSince, type RawTransaction } from "@/lib/transactionDocs";
import { doc, runTransaction, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import type { AuthUser, Account, Transaction, CategoryKind } from "../types/types";

// Firestore allows 500 writes per batch.
const BATCH_SIZE = 400;

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

  // Both legs of each transfer between your accounts, found in the loaded window.
  const transferPairs = store.transferPairs;

  // Account names are joined in memory, so an accounts update never re-reads transactions.
  const transactions = useMemo<Transaction[]>(() => {
    return rawTransactions.map((tx) => {
      const originAccName = accountNameById.get(tx.originAccId) ?? "Unlinked Account";

      // Soft warning only: a transfer to an unknown account shouldn't block the list.
      if (tx.categoryKind === "transfer" && tx.transferAccountId && !accountNameById.has(tx.transferAccountId)) {
        console.warn(`[useTransactions] Transaction ${tx.id} transfers to unknown account "${tx.transferAccountId}".`);
      }

      return { ...tx, originAccName, transferPairId: transferPairs.get(tx.id) ?? null };
    });
  }, [rawTransactions, accountNameById, transferPairs]);

  /**
   * Merchant memory: records the category you chose for this merchant. The
   * second time in a row, new transactions from it get that category too.
   * Best-effort; a failed write never affects the categorization itself.
   */
  const rememberMerchant = useCallback(
    async (tx: RawTransaction, categoryId: string) => {
      if (!user?.uid) return;
      const key = merchantKey(transactionInput(tx));
      if (!key) return;
      const ref = doc(db, "users", user.uid, "merchantMemory", key);
      try {
        await runTransaction(db, async (t) => {
          const snap = await t.get(ref);
          const current = snap.exists() ? parseMemory(snap.id, snap.data()) : null;
          const label = tx.merchantName ?? tx.rawName ?? tx.displayName;
          t.set(ref, { ...nextMemory(current, key, label, categoryId), updatedAt: serverTimestamp() });
        });
      } catch (err) {
        console.error("[useTransactions] Failed to update merchant memory:", err);
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
   * write is rejected. Your pick is marked as yours, so automation never
   * changes it, and a new pick feeds merchant memory (never for transfers).
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
          categorySource: categoryKind ? "user" : null,
          ...(categoryKind ? { suggestedCategoryId: null } : {}),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to update assignment:", err);
        setActionError("Failed to update assignment.");
        return false;
      }

      const isActuallyDifferent = target.categoryKind !== categoryKind || target.categoryId !== categoryId;
      if (categoryKind && categoryKind !== "transfer" && categoryId && isActuallyDifferent) {
        void rememberMerchant(target, categoryId);
      }
      return true;
    },
    [user, rawTransactions, rememberMerchant]
  );

  /**
   * Saves changes to many transactions in batches (a rule applied to past
   * transactions, or accepted suggestions). Returns how many were saved.
   */
  const applyUpdates = useCallback(
    async (updates: readonly TransactionUpdate[]): Promise<number> => {
      if (!user?.uid || updates.length === 0) return 0;
      let saved = 0;
      try {
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const chunk = updates.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          for (const { id, changes } of chunk) {
            batch.update(doc(db, "users", user.uid, "transactions", id), { ...changes, updatedAt: serverTimestamp() });
          }
          await batch.commit();
          saved += chunk.length;
        }
      } catch (err) {
        console.error("[useTransactions] Failed to save changes:", err);
        setActionError(
          saved > 0 ? `Saved ${saved} of ${updates.length} changes. The rest failed; try again.` : "Failed to save changes."
        );
      }
      return saved;
    },
    [user]
  );

  return {
    transactions,
    transactionsLoading,
    transactionsError,
    setTransactionsError: setActionError,
    hasOlderTransactions: store.hasOlder,
    loadOlderTransactions: store.loadOlder,
    updateTransactionAssignment,
    applyUpdates,
  };
}
