import { NextResponse } from "next/server";
import { requireUser } from "@/lib/services/auth";
import { removeItem } from "@/lib/services/plaidService";
import { decryptSecret } from "@/lib/services/encryption";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    }

    const itemRef = adminDb
      .collection("users")
      .doc(user.uid)
      .collection("plaidItems")
      .doc(itemId);

    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      // Already gone — nothing to disconnect. Treat as success so the
      // caller's account deletion isn't blocked by a stale reference.
      return NextResponse.json({ success: true });
    }

    const { accessToken } = itemSnap.data() as { accessToken: string };

    try {
      await removeItem(decryptSecret(accessToken));
    } catch (err) {
      // Plaid may already consider the item revoked (e.g. the user pulled
      // access from their bank's side) — don't let that block cleaning up
      // our own records.
      console.warn(`[disconnect-item] Plaid itemRemove failed for ${itemId}, continuing to clean up locally:`, err);
    }

    await itemRef.delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to disconnect Plaid item" },
      { status: 500 }
    );
  }
}