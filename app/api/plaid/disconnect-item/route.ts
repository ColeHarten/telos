import { NextResponse } from "next/server";
import { readJsonObject, requireId, withUser } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { decryptSecret } from "@/lib/services/encryption";
import { errorFields, logWarn } from "@/lib/services/logging";
import { removeItem } from "@/lib/services/plaidService";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { plaidItemsCollection, plaidItemStatusCollection } from "@/lib/services/syncService";

// Revokes Plaid's access to a bank connection and deletes its records.
export const POST = withUser({ name: "disconnect-item", rateLimit: RATE_LIMITS.disconnect }, async ({ req, user }) => {
  const itemId = requireId(await readJsonObject(req), "itemId");

  const itemRef = plaidItemsCollection(user.uid).doc(itemId);
  const itemSnap = await itemRef.get();

  if (itemSnap.exists) {
    const { accessToken } = itemSnap.data() as { accessToken: string };
    try {
      await removeItem(decryptSecret(accessToken));
    } catch (err) {
      // Plaid may already have revoked the item; our records are removed either way.
      logWarn("disconnect-item", "Plaid itemRemove failed; removing local records", { itemId, ...errorFields(err) });
    }
  }

  // A connection that is already gone still succeeds, so a stale reference
  // can't block deleting an account.
  const batch = getAdminDb().batch();
  batch.delete(itemRef);
  batch.delete(plaidItemStatusCollection(user.uid).doc(itemId));
  await batch.commit();

  return NextResponse.json({ success: true });
});
