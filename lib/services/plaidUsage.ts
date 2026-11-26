import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { PlaidEnv } from "./plaidEnv";

// Plaid's free Trial plan allows 10 Production connections.
const DEFAULT_ITEM_LIMIT = 10;

/** One doc per environment in the top-level plaidUsage collection, which browsers can't read. */
function usageRef(env: PlaidEnv) {
  return getAdminDb().collection("plaidUsage").doc(env);
}

/**
 * Counts a connection when its public token is exchanged, across all users.
 * Removing a connection doesn't give it back at Plaid, so this never goes down.
 */
export async function recordItemCreated(env: PlaidEnv): Promise<void> {
  await usageRef(env).set({ itemsCreated: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
}

/** PLAID_ITEM_LIMIT overrides the limit shown, for a plan other than the Trial. */
export function plaidItemLimit(): number {
  const value = Number(process.env.PLAID_ITEM_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_ITEM_LIMIT;
}

export async function getItemUsage(env: PlaidEnv): Promise<{ used: number; limit: number }> {
  const snap = await usageRef(env).get();
  const used = Number(snap.data()?.itemsCreated ?? 0);
  return { used: Number.isFinite(used) ? used : 0, limit: plaidItemLimit() };
}
