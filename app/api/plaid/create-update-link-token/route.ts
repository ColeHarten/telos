import { NextResponse } from "next/server";
import { ApiError, readJsonObject, requireId, withUser } from "@/lib/api/handler";
import { decryptSecret } from "@/lib/services/encryption";
import { createUpdateModeLinkToken } from "@/lib/services/plaidService";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { assertItemEnvironment, plaidItemsCollection } from "@/lib/services/syncService";

// Link token for update mode: Reconnect (sign in again) or, with
// accountSelection, Manage accounts (change which accounts are shared).
export const POST = withUser({ name: "create-update-link-token", rateLimit: RATE_LIMITS.linkToken }, async ({ req, user }) => {
  const body = await readJsonObject(req);
  const itemId = requireId(body, "itemId");
  const accountSelection = body.accountSelection === true;

  const itemSnap = await plaidItemsCollection(user.uid).doc(itemId).get();
  if (!itemSnap.exists) {
    throw new ApiError(404, "not_found", "That bank connection no longer exists.");
  }

  const item = itemSnap.data() as { accessToken: string; plaidEnv?: unknown };
  assertItemEnvironment(item);
  const linkToken = await createUpdateModeLinkToken(user.uid, decryptSecret(item.accessToken), accountSelection);

  return NextResponse.json({ linkToken });
});
