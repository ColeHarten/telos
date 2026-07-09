"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, query, getDocs, orderBy, doc, updateDoc } from "firebase/firestore";
import type { PersonalFinanceCategory } from "plaid";
import type { AuthUser, Account, Transaction, AssignmentType } from "../types/types";

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
 * logged and coerced to "unassigned".
 */
function normalizeAssignment(
  rawType: unknown,
  rawId: unknown,
  context: string
): { assignmentType: AssignmentType; assignmentId: string | undefined } {
  let assignmentType = (typeof rawType === "string" ? rawType : undefined) as AssignmentType | undefined;
  const assignmentId = typeof rawId === "string" && rawId.length > 0 ? rawId : undefined;

  assignmentType = assignmentType ?? "unassigned";

  const hasId = Boolean(assignmentId);
  const isConsistent = (assignmentType === "unassigned" && !hasId) || (assignmentType !== "unassigned" && hasId);

  if (!isConsistent) {
    console.warn(
      `[useTransactions] Inconsistent assignment for ${context}: type="${assignmentType}", id="${assignmentId ?? "none"}". Falling back to "unassigned".`
    );
    return { assignmentType: "unassigned", assignmentId: undefined };
  }

  return { assignmentType, assignmentId };
}

/**
 * Strict invariant check used before writing an assignment. Unlike
 * normalizeAssignment, this throws — an invalid combination reaching this
 * point means the caller (our own UI code) has a bug, not that Firestore has
 * bad data, so it should fail loudly during development.
 */
function assertValidAssignment(assignmentType: AssignmentType, assignmentId: string | undefined, originAccId: string): void {
  if (assignmentType === "unassigned") {
    if (assignmentId) {
      throw new Error(`Invalid assignment: type is "unassigned" but assignmentId ("${assignmentId}") was provided.`);
    }
    return;
  }

  if (!assignmentId) {
    throw new Error(`Invalid assignment: type is "${assignmentType}" but no assignmentId was provided.`);
  }

  if (assignmentType === "account_transfer" && assignmentId === originAccId) {
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
    assignmentType?: string;
    assignmentId?: string | null;
  },
  accountName: string
): Transaction {
  const originAccId = data.accountId || "unlinked";
  const { assignmentType, assignmentId } = normalizeAssignment(
    data.assignmentType,
    data.assignmentId,
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
    categoryPrimary: data.category?.primary ?? null,
    categoryDetailed: data.category?.detailed ?? null,
    assignmentType,
    assignmentId,
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

        // Soft warning only — an account_transfer pointing at an account we
        // don't know about shouldn't block rendering the rest of the list.
        if (tx.assignmentType === "account_transfer" && tx.assignmentId && !accountNameById.has(tx.assignmentId)) {
          console.warn(`[useTransactions] Transaction ${tx.id} transfers to unknown account "${tx.assignmentId}".`);
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
   * Assigns a transaction to a cashflow (income/expense) or to an account
   * (account_transfer), or clears the assignment entirely ("unassigned").
   * Optimistically updates local state so the UI reflects the change
   * instantly; reverts via the previous snapshot if the write fails.
   *
   * assignmentId is required unless assignmentType is "unassigned" — this is
   * enforced by assertValidAssignment before anything is written.
   */
  const updateTransactionAssignment = useCallback(
    async (transactionId: string, assignmentType: AssignmentType, assignmentId?: string) => {
      if (!user?.uid) return;

      const target = transactions.find((tx) => tx.id === transactionId);
      if (!target) {
        console.error(`[useTransactions] updateTransactionAssignment: no transaction found with id "${transactionId}".`);
        setTransactionsError("Could not find that transaction.");
        return;
      }

      try {
        assertValidAssignment(assignmentType, assignmentId, target.originAccId);
      } catch (err) {
        console.error("[useTransactions] Invalid assignment:", err);
        setTransactionsError(err instanceof Error ? err.message : "Invalid assignment.");
        return;
      }

      const previous = transactions;
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === transactionId ? { ...tx, assignmentType, assignmentId } : tx))
      );

      try {
        const txRef = doc(db, "users", user.uid, "transactions", transactionId);
        await updateDoc(txRef, {
          assignmentType,
          // Firestore rejects `undefined` field values — write `null` to
          // explicitly clear the field when unassigning.
          assignmentId: assignmentId ?? null,
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