"use client";

import { isSyncRunning, subscribeSyncRunning } from "@/lib/plaidSync";
import { useSyncExternalStore } from "react";

/** True while a sync runs in this tab, whether you started it or Telos did (see useAutoSync). */
export default function useSyncRunning(): boolean {
  return useSyncExternalStore(subscribeSyncRunning, isSyncRunning, () => false);
}
