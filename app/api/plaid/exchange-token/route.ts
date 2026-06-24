import { NextResponse } from "next/server";
import { requireUser } from "@/lib/services/auth";
import {
  exchangePublicToken,
  fetchAccounts,
} from "@/lib/services/plaidService";
import { adminDb } from "@/lib/firebaseAdmin";
import { syncPlaidItem } from "@/lib/services/syncService";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { public_token } = await req.json();

    const exchange = await exchangePublicToken(public_token);

    const accessToken = exchange.access_token;
    const itemId = exchange.item_id;

    const accounts = await fetchAccounts(accessToken);

    const itemRef = adminDb
      .collection("users")
      .doc(user.uid)
      .collection("plaidItems")
      .doc(itemId);

    // SECURITY NOTE: encrypt in production
    await itemRef.set({
      accessToken,
      itemId,
      cursor: "",
      createdAt: Date.now(),
    });

    const accountsRef = adminDb
      .collection("users")
      .doc(user.uid)
      .collection("plaidAccounts");

    for (const acc of accounts) {
      await accountsRef.doc(acc.account_id).set({
        plaidAccountId: acc.account_id,
        itemId,
        name: acc.name,
        mask: acc.mask,
        subtype: acc.subtype,
        type: acc.type,
        currentBalance: acc.balances.current,
        availableBalance: acc.balances.available,
      });
    }

    // initial sync
    await syncPlaidItem(user.uid, itemId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Exchange failed" },
      { status: 500 }
    );
  }
}