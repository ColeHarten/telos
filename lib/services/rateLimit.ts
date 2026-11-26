import "server-only";

import { getAdminDb } from "@/lib/firebaseAdmin";

export type RateLimitRule = {
  /** Counter name, unique per route. */
  bucket: string;
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  sync: { bucket: "sync", limit: 10, windowSeconds: 60 },
  linkToken: { bucket: "link-token", limit: 10, windowSeconds: 60 },
  exchangeToken: { bucket: "exchange-token", limit: 5, windowSeconds: 60 },
  disconnect: { bucket: "disconnect", limit: 10, windowSeconds: 60 },
  deleteAccount: { bucket: "delete-account", limit: 10, windowSeconds: 60 },
  refresh: { bucket: "refresh", limit: 4, windowSeconds: 60 },
  rebuild: { bucket: "rebuild", limit: 2, windowSeconds: 60 },
  usage: { bucket: "usage", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type CounterDoc = { windowStart?: number; count?: number };

/**
 * Fixed-window counter per user and bucket in the top-level `rateLimits`
 * collection, which the rules keep away from browsers. `expiresAt` lets an
 * optional Firestore TTL policy delete old counters.
 */
export async function checkRateLimit(uid: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const db = getAdminDb();
  const ref = db.collection("rateLimits").doc(`${uid}_${rule.bucket}`);
  const windowMs = rule.windowSeconds * 1000;

  return db.runTransaction(async (tx): Promise<RateLimitResult> => {
    const now = Date.now();
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {}) as CounterDoc;
    const windowStart = data.windowStart ?? 0;

    if (now - windowStart >= windowMs) {
      tx.set(ref, { windowStart: now, count: 1, expiresAt: new Date(now + windowMs) });
      return { allowed: true };
    }

    const count = data.count ?? 0;
    if (count >= rule.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
    }

    tx.update(ref, { count: count + 1 });
    return { allowed: true };
  });
}
