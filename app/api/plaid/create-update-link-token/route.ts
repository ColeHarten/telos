import { NextResponse } from "next/server";
import { ApiError, readJsonObject, requireId, withUser } from "@/lib/api/handler";
import { decryptSecret } from "@/lib/services/encryption";
import { createUpdateModeLinkToken } from "@/lib/services/plaidService";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { plaidItemsCollection } from "@/lib/services/syncService";

// Link token for update mode, used to reconnect a bank that needs the user to sign in again.
export const POST = withUser({ name: "create-update-link-token", rateLimit: RATE_LIMITS.linkToken }, async ({ req, user }) => {
  const itemId = requireId(await readJsonObject(req), "itemId");

  const itemSnap = await plaidItemsCollection(user.uid).doc(itemId).get();
  if (!itemSnap.exists) {
    throw new ApiError(404, "not_found", "That bank connection no longer exists.");
  }

  const { accessToken } = itemSnap.data() as { accessToken: string };
  const linkToken = await createUpdateModeLinkToken(user.uid, decryptSecret(accessToken));

  return NextResponse.json({ linkToken });
});
