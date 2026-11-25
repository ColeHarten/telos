import { NextResponse } from "next/server";
import { ApiError, badRequest, readJsonObject, requireString, withUser } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { encryptSecret } from "@/lib/services/encryption";
import { errorFields, logError, logWarn } from "@/lib/services/logging";
import {
  exchangePublicToken,
  fetchAccounts,
  getInstitutionForItem,
  getNormalBalanceFromPlaid,
  mapPlaidAccountType,
  removeItem,
} from "@/lib/services/plaidService";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { plaidItemsCollection, plaidItemStatusCollection, syncPlaidItem } from "@/lib/services/syncService";

// The first sync runs before responding and can take several seconds.
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

  try {
    await syncPlaidItem(user.uid, itemId);
  } catch (err) {
    // The connection is saved; the next sync picks up its transactions.
    logError("exchange-token", err, { itemId, step: "initial-sync" });
  }

  return NextResponse.json({ success: true, ...result });
});

/**
 * Saves the connection, its status doc, and its new accounts in one batch.
 *
 * Linking a bank again through normal Link (not update mode) creates a new
 * item with new account ids, so accounts are deduped on (institution, mask)
 * among active linked accounts. Accounts without a mask are always kept.
 */
async function saveConnection(uid: string, itemId: string, accessToken: string): Promise<LinkResult> {
  const [accounts, institution] = await Promise.all([fetchAccounts(accessToken), getInstitutionForItem(accessToken)]);
  const institutionId = institution?.institutionId ?? null;
  const institutionName = institution?.institutionName ?? null;

  const db = getAdminDb();
  const accountsRef = db.collection("users").doc(uid).collection("accounts");

  const existingSnap = await accountsRef.get();
  const existingKeys = new Set<string>();
  existingSnap.docs.forEach((d) => {
    const data = d.data();
    if (!data.plaidItemId || data.isArchived || !data.plaidMask) return;
    existingKeys.add(`${data.plaidInstitutionId ?? ""}::${data.plaidMask}`);
  });

  const newAccounts = accounts.filter((acc) => !acc.mask || !existingKeys.has(`${institutionId ?? ""}::${acc.mask}`));
  const duplicateAccounts = accounts.filter((acc) => !newAccounts.includes(acc));

  if (newAccounts.length === 0) {
    throw new ApiError(409, "duplicate_accounts", "This bank account is already linked.");
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
