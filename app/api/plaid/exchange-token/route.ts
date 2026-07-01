import { NextResponse } from "next/server";
import { requireUser } from "@/lib/services/auth";
import {
  exchangePublicToken,
  fetchAccounts,
  getInstitutionForItem,
  mapPlaidAccountType,
  getNormalBalanceFromPlaid,
} from "@/lib/services/plaidService";
import { adminDb } from "@/lib/firebaseAdmin";
import { syncPlaidItem } from "@/lib/services/syncService";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { public_token } = await req.json();

    const exchange = await exchangePublicToken(public_token);

    const accessToken = exchange.access_token;
    const plaidItemId = exchange.item_id;

    const accounts = await fetchAccounts(accessToken);

    const itemRef = adminDb
      .collection("users")
      .doc(user.uid)
      .collection("plaidItems")
      .doc(plaidItemId);

    // store info about the institution with the item
    const institution = await getInstitutionForItem(accessToken);

    // SECURITY NOTE: encrypt these using a key derived from the user's id and a master key stored in the server environment
    await itemRef.set({
      accessToken,
      itemId: plaidItemId,
      cursor: "",
      createdAt: Date.now(),
      institutionId: institution?.institutionId ?? null,
      institutionName: institution?.institutionName ?? null,
    });

    const accountsRef = adminDb
      .collection("users")
      .doc(user.uid)
      .collection("accounts");

    const accountBatch = adminDb.batch();

    for (const acc of accounts) {
      accountBatch.set(accountsRef.doc(acc.account_id), {
        name: acc.name,
        accountType: mapPlaidAccountType(acc),
        normalBalance: getNormalBalanceFromPlaid(acc),
        startingBalance: acc.balances.current ?? 0,
        currentBalance: acc.balances.current ?? 0,
        isManual: false,
        isArchived: false,
        plaidAccountId: acc.account_id,
        plaidItemId: plaidItemId,
        plaidMask: acc.mask ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await accountBatch.commit();

    // initial sync
    await syncPlaidItem(user.uid, plaidItemId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Exchange failed" },
      { status: 500 }
    );
  }
}