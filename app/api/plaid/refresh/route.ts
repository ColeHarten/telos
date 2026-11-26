import { NextResponse } from "next/server";
import { readOptionalJsonObject, requireId, withUser } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { refreshPlaidItems } from "@/lib/services/syncService";

// Refresh from bank: asks Plaid to check the bank now instead of at its next
// scheduled check. New transactions arrive at a later sync.
export const POST = withUser({ name: "refresh", rateLimit: RATE_LIMITS.refresh }, async ({ req, user }) => {
  const body = await readOptionalJsonObject(req);
  const itemId = body.itemId === undefined ? undefined : requireId(body, "itemId");
  const result = await refreshPlaidItems(user.uid, itemId);
  return NextResponse.json({ success: true, ...result });
});
