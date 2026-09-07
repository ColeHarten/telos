import { NextResponse } from "next/server";
import { requireUser } from "@/lib/services/auth";
import {
  exchangePublicToken,
  fetchAccounts,
  getInstitutionForItem,
  mapPlaidAccountType,
  getNormalBalanceFromPlaid,
} from "@/lib/services/plaidService";
import { encryptSecret } from "@/lib/services/encryption";
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
    const institution = await getInstitutionForItem(accessToken);
    const institutionId = institution?.institutionId ?? null;

    // --- Duplicate prevention ---------------------------------------------
    // Re-linking an already-connected bank through normal Plaid Link (rather
    // than update mode — see plaidLinkButton.tsx) mints a brand-new Item with
    // brand-new account_ids for the same real-world accounts, so a naive
    // "doc id = plaidAccountId" write would create a second Account doc per
    // account. There's no stable cross-Item account identifier available
    // here, so we dedupe on the best available proxy: (institution, mask)
    // among the user's active, Plaid-linked accounts. Accounts with no mask
    // are never treated as duplicates — wrongly calling something "new" is
    // far less harmful than silently dropping a genuinely distinct account.
    const existingAccountsSnap = await adminDb
      .collection("users")
      .doc(user.uid)
      .collection("accounts")
      .get();

    const existingKeys = new Set<string>();
    existingAccountsSnap.docs.forEach((d) => {
      const data = d.data();
      if (!data.plaidItemId || data.isArchived || !data.plaidMask) return;
      existingKeys.add(`${data.plaidInstitutionId ?? ""}::${data.plaidMask}`);
    });

    const newAccounts = accounts.filter(
      (acc) => !acc.mask || !existingKeys.has(`${institutionId ?? ""}::${acc.mask}`)
    );
    const duplicateAccounts = accounts.filter((acc) => !newAccounts.includes(acc));

    if (newAccounts.length === 0) {
      return NextResponse.json(
        { error: "duplicate_accounts", message: "This bank account is already linked." },
        { status: 409 }
      );
    }

    const itemRef = adminDb
      .collection("users")
      .doc(user.uid)
      .collection("plaidItems")
      .doc(plaidItemId);

    await itemRef.set({
      accessToken: encryptSecret(accessToken),
      itemId: plaidItemId,
      cursor: "",
      createdAt: Date.now(),
      institutionId,
      institutionName: institution?.institutionName ?? null,
      skippedDuplicateAccountIds: duplicateAccounts.map((acc) => acc.account_id),
    });

    const accountsRef = adminDb.collection("users").doc(user.uid).collection("accounts");
    const accountBatch = adminDb.batch();

    for (const acc of newAccounts) {
      accountBatch.set(accountsRef.doc(acc.account_id), {
        name: acc.name,
        accountType: mapPlaidAccountType(acc),
        normalBalance: getNormalBalanceFromPlaid(acc),
        startingBalance: acc.balances.current ?? 0,
        currentBalance: acc.balances.current ?? 0,
        isManual: false,
        isArchived: false,
        isContributionEligible: false,
        plaidAccountId: acc.account_id,
        plaidItemId: plaidItemId,
        plaidInstitutionId: institutionId,
        plaidMask: acc.mask ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await accountBatch.commit();
    await syncPlaidItem(user.uid, plaidItemId);

    return NextResponse.json({
      success: true,
      accounts: newAccounts.map((acc) => ({
        id: acc.account_id,
        name: acc.name,
        accountType: mapPlaidAccountType(acc),
      })),
      skippedDuplicateCount: duplicateAccounts.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Exchange failed" }, { status: 500 });
  }
}