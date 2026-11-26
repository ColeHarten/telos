"use client";

import { autoSyncDue, toPlaidConnection } from "@/lib/connections";
import { db } from "@/lib/firebaseClient";
import { runSync } from "@/lib/plaidSync";
import type { PlaidConnection } from "@/lib/types/types";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

const TICK_MS = 5 * 1000;

/**
 * Keeps bank data fresh while Telos is open: syncs on open when the data is
 * more than six hours old, continues a large import until it's done, and
 * checks every two minutes while a bank is importing history or refreshing.
 * Nothing runs while the tab is hidden. See autoSyncDue for the rules.
 * Returns each bank's status, for the header sync chip.
 */
export default function useAutoSync(uid: string | null): PlaidConnection[] {
  const [latest, setLatest] = useState<{ uid: string; connections: PlaidConnection[] } | null>(null);

  useEffect(() => {
    if (!uid) return;

    let connections: PlaidConnection[] = [];
    let loaded = false;
    let busy = false;
    let lastRunAt = 0;
    // Connections from another Plaid environment, which the server leaves alone.
    let otherEnv = new Set<string>();

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "plaidItemStatus"),
      (snapshot) => {
        connections = snapshot.docs.map((d) => toPlaidConnection(d.id, d.data()));
        loaded = true;
        setLatest({ uid, connections });
      },
      (err) => console.error("[useAutoSync] Could not load connection status:", err)
    );

    const tick = () => {
      if (!loaded || busy || document.visibilityState === "hidden") return;
      const candidates = connections.filter((connection) => !otherEnv.has(connection.itemId));
      if (!autoSyncDue(candidates, lastRunAt, Date.now())) return;

      busy = true;
      runSync()
        .then((summary) => {
          otherEnv = new Set(summary.itemsOtherEnv);
        })
        .catch((error: unknown) => console.error("[useAutoSync] Sync failed:", error))
        .finally(() => {
          busy = false;
          lastRunAt = Date.now();
        });
    };

    const interval = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [uid]);

  return latest && latest.uid === uid ? latest.connections : [];
}
