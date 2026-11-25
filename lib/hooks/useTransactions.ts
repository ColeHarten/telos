"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
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
 * (categoryKind, categoryId) pair.
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
 *
 * transferAccountId is validated here (rather than categoryId) against the
 * transaction's own origin account, since categoryId for a "transfer"
 * assignment is a Category doc id, not an Account id — see
 * updateTransactionAssignment for where transferAccountId is resolved.
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

// Raw fields of a transaction doc. The account name is joined later, in memory.
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
    transferAccountId?: string | null;
  }
): Omit<Transaction, "originAccName"> {
  const originAccId = data.accountId || "unlinked";
  const { categoryKind, categoryId } = normalizeAssignment(
    data.categoryKind,
    data.categoryId,
    `transaction ${id}`
  );

  return {
    id,
    originAccId,
    displayName: resolveDisplayName(data.merchantName ?? null, data.rawName ?? ""),
    amount: data.amount ?? 0,
    date: data.date ?? "",
    pending: Boolean(data.pending),
    plaidCategoryPrimary: data.category?.primary ?? null,
    plaidCategoryDetailed: data.category?.detailed ?? null,
    categoryKind,
    categoryId,
    // Defensive: only meaningful for "transfer" — force null for any other
    // kind (or for unassigned), regardless of what's stored, so a stale or
    // hand-edited field can never leak into the wrong place.
    transferAccountId: categoryKind === "transfer" ? data.transferAccountId ?? null : null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type RawTransaction = Omit<Transaction, "originAccName">;

// Months of history loaded at first; "Load older transactions" adds more.
const INITIAL_MONTHS = 24;
const MONTHS_PER_PAGE = 12;

/** First day of the month `months` months ago, as YYYY-MM-DD (transaction dates use this format). */
function cutoffDate(months: number): string {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const month = String(cutoff.getMonth() + 1).padStart(2, "0");
  return `${cutoff.getFullYear()}-${month}-01`;
}

type Loaded = { key: string; items: RawTransaction[]; error: string | null };

export default function useTransactions(user: AuthUser | null, authLoading: boolean, accounts: Account[]) {
  const uid = authLoading ? null : user?.uid ?? null;
  const [months, setMonths] = useState(INITIAL_MONTHS);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [olderCheck, setOlderCheck] = useState<{ key: string; hasOlder: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const key = uid ? `${uid}:${months}` : null;

  // Live listener over the loaded window, so syncs, edits in other tabs, and
  // server-side rules show up without a refresh.
  useEffect(() => {
    if (!uid) return;
    const listenerKey = `${uid}:${months}`;
    const q = query(
      collection(db, "users", uid, "transactions"),
      where("date", ">=", cutoffDate(months)),
      orderBy("date", "desc")
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) =>
          toTransaction(docSnap.id, docSnap.data() as Parameters<typeof toTransaction>[1])
        );
        setLoaded({ key: listenerKey, items, error: null });
      },
      (err) => {
        console.error("[useTransactions] Listener error:", err);
        setLoaded({ key: listenerKey, items: [], error: "Failed to load transactions." });
      }
    );
  }, [uid, months]);

  // Whether anything exists before the loaded window.
  useEffect(() => {
    if (!uid) return;
    const checkKey = `${uid}:${months}`;
    const q = query(
      collection(db, "users", uid, "transactions"),
      where("date", "<", cutoffDate(months)),
      orderBy("date", "desc"),
      limit(1)
    );
    getDocs(q)
      .then((snap) => setOlderCheck({ key: checkKey, hasOlder: !snap.empty }))
      .catch((err: unknown) => {
        console.error("[useTransactions] Could not check for older transactions:", err);
        setOlderCheck({ key: checkKey, hasOlder: false });
      });
  }, [uid, months]);

  const current = loaded && loaded.key === key ? loaded : null;
  // While a wider window loads, keep showing the previous one.
  const sameUser = Boolean(uid && loaded?.key.startsWith(`${uid}:`));
  const rawTransactions = useMemo(
    () => current?.items ?? (sameUser && loaded ? loaded.items : []),
    [current, sameUser, loaded]
  );
  const transactionsLoading = authLoading || (Boolean(uid) && !current);
  const hasOlderTransactions = Boolean(olderCheck && olderCheck.key === key && olderCheck.hasOlder);
  const transactionsError = actionError ?? current?.error ?? null;

  const loadOlderTransactions = useCallback(() => setMonths((m) => m + MONTHS_PER_PAGE), []);

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
   */
  const updateTransactionAssignment = useCallback(
    async (
      transactionId: string,
      categoryKind: CategoryKind | undefined,
      categoryId?: string,
      transferAccountId?: string | null
    ) => {
      if (!user?.uid) return;

      const target = rawTransactions.find((tx) => tx.id === transactionId);
      if (!target) {
        console.error(`[useTransactions] updateTransactionAssignment: no transaction found with id "${transactionId}".`);
        setActionError("Could not find that transaction.");
        return;
      }

      const normalizedTransferAccountId = categoryKind === "transfer" ? transferAccountId ?? null : null;

      try {
        assertValidAssignment(categoryKind, categoryId, normalizedTransferAccountId, target.originAccId);
      } catch (err) {
        console.error("[useTransactions] Invalid assignment:", err);
        setActionError(err instanceof Error ? err.message : "Invalid assignment.");
        return;
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
        return;
      }

      // Vote only for a real category that differs from before, on a
      // transaction with a Plaid code to learn from.
      const isRealAssignment = Boolean(categoryKind) && Boolean(categoryId);
      const isActuallyDifferent = target.categoryKind !== categoryKind || target.categoryId !== categoryId;
      if (isRealAssignment && isActuallyDifferent && target.plaidCategoryDetailed && categoryId) {
        void recordCategorySignal(target.plaidCategoryDetailed, categoryId);
      }
    },
    [user, rawTransactions, recordCategorySignal]
  );

  return {
    transactions,
    transactionsLoading,
    transactionsError,
    setTransactionsError: setActionError,
    hasOlderTransactions,
    loadOlderTransactions,
    updateTransactionAssignment,
  };
}
