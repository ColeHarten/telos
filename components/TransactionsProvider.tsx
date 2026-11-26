"use client";

import { db } from "@/lib/firebaseClient";
import { cutoffDate, toTransaction, type RawTransaction, type TransactionDocData } from "@/lib/transactionDocs";
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * One live transactions listener for the signed-in session, shared by every
 * page. Pages used to open their own listener, so each visit to Transactions,
 * Budgets, or the Dashboard re-read every transaction.
 */

// Months of history loaded at first; "Load older transactions" adds more.
const INITIAL_MONTHS = 24;
const MONTHS_PER_PAGE = 12;

export type TransactionsStore = {
  items: RawTransaction[];
  loading: boolean;
  error: string | null;
  /** Months of history the listener covers. */
  months: number;
  hasOlder: boolean;
  loadOlder: () => void;
  /** Widens the window to cover at least this many months back. */
  ensureMonths: (months: number) => void;
};

const TransactionsContext = createContext<TransactionsStore | null>(null);

type Loaded = { key: string; items: RawTransaction[]; error: string | null };

export function TransactionsProvider({ uid, children }: { uid: string | null; children: React.ReactNode }) {
  const [pagedMonths, setPagedMonths] = useState(INITIAL_MONTHS);
  const [requestedMonths, setRequestedMonths] = useState(0);
  const months = Math.max(pagedMonths, requestedMonths);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [olderCheck, setOlderCheck] = useState<{ key: string; hasOlder: boolean } | null>(null);

  const key = uid ? `${uid}:${months}` : null;

  // Live listener over the window, so syncs, edits in other tabs, and
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
        const items: RawTransaction[] = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as TransactionDocData;
          // Removed by Plaid; the sync job deletes it when its loop finishes.
          if (data.removedByPlaid === true) return;
          items.push(toTransaction(docSnap.id, data));
        });
        setLoaded({ key: listenerKey, items, error: null });
      },
      (err) => {
        console.error("[TransactionsProvider] Listener error:", err);
        setLoaded({ key: listenerKey, items: [], error: "Failed to load transactions." });
      }
    );
  }, [uid, months]);

  // Whether anything exists before the window.
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
        console.error("[TransactionsProvider] Could not check for older transactions:", err);
        setOlderCheck({ key: checkKey, hasOlder: false });
      });
  }, [uid, months]);

  const current = loaded && loaded.key === key ? loaded : null;
  // While a wider window loads, keep showing the previous one.
  const sameUser = Boolean(uid && loaded?.key.startsWith(`${uid}:`));
  const items = useMemo(() => current?.items ?? (sameUser && loaded ? loaded.items : []), [current, sameUser, loaded]);
  const loading = Boolean(uid) && !current;
  const error = current?.error ?? null;
  const hasOlder = Boolean(olderCheck && olderCheck.key === key && olderCheck.hasOlder);

  const loadOlder = useCallback(() => setPagedMonths((m) => m + MONTHS_PER_PAGE), []);
  const ensureMonths = useCallback(
    (needed: number) => setRequestedMonths((m) => (needed > m ? needed : m)),
    []
  );

  const value = useMemo<TransactionsStore>(
    () => ({ items, loading, error, months, hasOlder, loadOlder, ensureMonths }),
    [items, loading, error, months, hasOlder, loadOlder, ensureMonths]
  );

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactionsStore(): TransactionsStore {
  const store = useContext(TransactionsContext);
  if (!store) throw new Error("useTransactionsStore must be used inside TransactionsProvider.");
  return store;
}
