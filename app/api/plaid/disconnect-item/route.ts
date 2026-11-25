import { NextResponse } from "next/server";
import { readJsonObject, requireId, withUser } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { disconnectPlaidItem } from "@/lib/services/syncService";

// Disconnects a bank. Its accounts become manual accounts that keep their
// history and last balance.
export const POST = withUser({ name: "disconnect-item", rateLimit: RATE_LIMITS.disconnect }, async ({ req, user }) => {
  const itemId = requireId(await readJsonObject(req), "itemId");
  const convertedAccounts = await disconnectPlaidItem(user.uid, itemId);
  return NextResponse.json({ success: true, convertedAccounts });
});
