import { NextResponse } from "next/server";
import { readJsonObject, requireId, withUser } from "@/lib/api/handler";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { startRebuild } from "@/lib/services/syncService";

// Rebuild from Plaid: re-imports a bank's full history without linking it
// again. Categories are kept. The browser runs the syncs that do the import.
export const POST = withUser({ name: "rebuild", rateLimit: RATE_LIMITS.rebuild }, async ({ req, user }) => {
  const itemId = requireId(await readJsonObject(req), "itemId");
  await startRebuild(user.uid, itemId);
  return NextResponse.json({ success: true });
});
