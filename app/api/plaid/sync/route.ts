import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { syncAllPlaidItems } from "@/lib/services/syncService";

// A first sync can wait several seconds for Plaid to prepare transactions.
export const maxDuration = 60;

export const POST = withUser({ name: "sync", rateLimit: RATE_LIMITS.sync }, async ({ user }) => {
  const result = await syncAllPlaidItems(user.uid);
  return NextResponse.json({ success: true, ...result });
});
