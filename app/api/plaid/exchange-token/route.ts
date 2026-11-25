import { after, NextResponse } from "next/server";
import { ApiError, badRequest, readJsonObject, requireString, withUser } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { encryptSecret } from "@/lib/services/encryption";
import { errorFields, logWarn } from "@/lib/services/logging";
import {
  exchangePublicToken,
  fetchAccounts,
  getInstitutionForItem,
  getNormalBalanceFromPlaid,
  mapPlaidAccountType,
  removeItem,
} from "@/lib/services/plaidService";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { plaidItemsCollection, plaidItemStatusCollection, syncItemAndRecord } from "@/lib/services/syncService";

// The first sync runs after the response is sent and can take several seconds.
export const maxDuration = 60;

type LinkedAccount = { id: string; name: string; accountType: string };
type LinkResult = { accounts: LinkedAccount[]; skippedDuplicateCount: number };

export const POST = withUser({ name: "exchange-token", rateLimit: RATE_LIMITS.exchangeToken }, async ({ req, user }) => {
  const publicToken = requireString(await readJsonObject(req), "public_token", 256);
  if (!publicToken.startsWith("public-")) {
    throw badRequest('"public_token" is not a Plaid public token.');
  }

  const exchange = await exchangePublicToken(publicToken);
  const accessToken = exchange.access_token;
  const itemId = exchange.item_id;

  let result: LinkResult;
  try {
    result = await saveConnection(user.uid, itemId, accessToken);
  } catch (err) {
    // Nothing was saved, so the new Plaid item would be orphaned. Remove it.
    await removeItem(accessToken).catch((removeErr: unknown) => {
      logWarn("exchange-token", "Could not remove unsaved Plaid item", { itemId, ...errorFields(removeErr) });
    });
    throw err;
  }

  // Respond now; transactions arrive through the live listener once this
  // sync finishes. Failures are recorded on the connection's status doc.
  after(() => syncItemAndRecord(user.uid, itemId));

  return NextResponse.json({ success: true, ...result });
});

type ExistingAccount = {
  plaidItemId?: string | null;
  plaidInstitutionId?: string | null;
  plaidMask?: string | null;
  name?: string;
  accountType?: string;
  isArchived?: boolean;
};

// Linking a bank again through normal Link (not update mode) creates a new
// item with new account ids, so accounts are matched on institution and mask,
// or on institution, name, and type when Plaid gives no mask.
function matchKey(institutionId: string | null, mask: string | null | undefined, name: string, accountType: string): string {
  return mask ? `${institutionId ?? ""}::mask::${mask}` : `${institutionId ?? ""}::name::${name}::${accountType}`;
}

/** Saves the connection, its status doc, and its new accounts in one batch. */
async function saveConnection(uid: string, itemId: string, accessToken: string): Promise<LinkResult> {
  const [accounts, institution] = await Promise.all([fetchAccounts(accessToken), getInstitutionForItem(accessToken)]);
  const institutionId = institution?.institutionId ?? null;
  const institutionName = institution?.institutionName ?? null;

  const db = getAdminDb();
  const accountsRef = db.collection("users").doc(uid).collection("accounts");

  // Archived accounts count too, so re-linking doesn't create a second copy
  // of an account that should be restored instead.
  const existing = new Map<string, { isArchived: boolean }>();
  (await accountsRef.get()).docs.forEach((d) => {
    const data = d.data() as ExistingAccount;
    if (!data.plaidItemId || !data.name || !data.accountType) return;
    const key = matchKey(data.plaidInstitutionId ?? null, data.plaidMask, data.name, data.accountType);
    existing.set(key, { isArchived: Boolean(data.isArchived) || existing.get(key)?.isArchived === true });
  });

  const duplicateOf = (acc: (typeof accounts)[number]) =>
    existing.get(matchKey(institutionId, acc.mask, acc.name, mapPlaidAccountType(acc)));
  const newAccounts = accounts.filter((acc) => !duplicateOf(acc));
  const duplicateAccounts = accounts.filter((acc) => duplicateOf(acc));

  if (newAccounts.length === 0) {
    const anyArchived = duplicateAccounts.some((acc) => duplicateOf(acc)?.isArchived);
    throw new ApiError(
      409,
      "duplicate_accounts",
      anyArchived
        ? "This bank account is already linked but archived. Restore it on the Accounts page instead."
        : "This bank account is already linked."
    );
  }

  const now = Date.now();
  const batch = db.batch();

  batch.set(plaidItemsCollection(uid).doc(itemId), {
    accessToken: encryptSecret(accessToken),
    itemId,
    cursor: "",
    createdAt: now,
    institutionId,
    institutionName,
    skippedDuplicateAccountIds: duplicateAccounts.map((acc) => acc.account_id),
  });

  batch.set(plaidItemStatusCollection(uid).doc(itemId), {
    institutionName,
    needsReauth: false,
    lastSyncedAt: null,
    lastSyncError: null,
    lastSyncErrorAt: null,
  });

  for (const acc of newAccounts) {
    const balance = acc.balances.current ?? 0;
    batch.set(accountsRef.doc(acc.account_id), {
      name: acc.name,
      accountType: mapPlaidAccountType(acc),
      normalBalance: getNormalBalanceFromPlaid(acc),
      startingBalance: balance,
      currentBalance: balance,
      balanceUpdatedAt: now,
      isManual: false,
      isArchived: false,
      isContributionEligible: false,
      plaidAccountId: acc.account_id,
      plaidItemId: itemId,
      plaidInstitutionId: institutionId,
      plaidMask: acc.mask ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();

  return {
    accounts: newAccounts.map((acc) => ({ id: acc.account_id, name: acc.name, accountType: mapPlaidAccountType(acc) })),
    skippedDuplicateCount: duplicateAccounts.length,
  };
}
