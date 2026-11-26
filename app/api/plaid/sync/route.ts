import { NextResponse } from "next/server";
import { readOptionalJsonObject, requireId, withUser } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { syncAllPlaidItems, SYNC_BUDGET_MS } from "@/lib/services/syncService";

// Each call pages through Plaid for up to SYNC_BUDGET_MS, then returns
// `more: true` if there's more to import; the browser calls again.
export const maxDuration = 60;

export const POST = withUser({ name: "sync", rateLimit: RATE_LIMITS.sync }, async ({ req, user }) => {
  const body = await readOptionalJsonObject(req);
  const itemId = body.itemId === undefined ? undefined : requireId(body, "itemId");
  const result = await syncAllPlaidItems(user.uid, { itemId, deadline: Date.now() + SYNC_BUDGET_MS });
  return NextResponse.json({ success: true, ...result });
});
