import { NextResponse } from "next/server";
import { requireUser } from "@/lib/services/auth";
import { createUpdateModeLinkToken } from "@/lib/services/plaidService";
import { decryptSecret } from "@/lib/services/encryption";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    }

    const itemSnap = await adminDb
      .collection("users")
      .doc(user.uid)
      .collection("plaidItems")
      .doc(itemId)
      .get();

    if (!itemSnap.exists) {
      return NextResponse.json({ error: "Plaid item not found" }, { status: 404 });
    }

    const { accessToken } = itemSnap.data() as { accessToken: string };
    const linkToken = await createUpdateModeLinkToken(user.uid, decryptSecret(accessToken));

    return NextResponse.json({ linkToken });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to create update-mode link token" },
      { status: 500 }
    );
  }
}