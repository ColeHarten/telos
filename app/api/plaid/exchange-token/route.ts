import { after, NextResponse } from "next/server";
import { ApiError, badRequest, readJsonObject, requireString, withUser } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { encryptSecret } from "@/lib/services/encryption";
import { assessLink, findLinkedDuplicates, type IncomingAccount } from "@/lib/services/linkGate";
import { errorFields, logError, logWarn } from "@/lib/services/logging";
import { currentPlaidEnv, exchangePublicToken, fetchAccounts, getItemDetails, removeItem } from "@/lib/services/plaidService";
import { recordItemCreated } from "@/lib/services/plaidUsage";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import {
  disconnectPlaidItem,
  listSavedAccounts,
  listSavedItems,
  plaidItemsCollection,
  plaidItemStatusCollection,
  reconcileItemAccounts,
  syncItemAndRecord,
  SYNC_BUDGET_MS,
} from "@/lib/services/syncService";

// The first sync runs after the response is sent.
export const maxDuration = 60;

const MAX_ACCOUNTS = 100;

type Institution = { institutionId: string | null; institutionName: string | null };
type LinkedAccount = { id: string; name: string; accountType: string };
type LinkResult = { accounts: LinkedAccount[]; skippedDuplicateCount: number; reattachedCount: number };

function optionalString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= maxLength ? value.trim() : null;
}

// Link's onSuccess metadata: the bank and accounts the user picked. It's only
// used to catch duplicates before the exchange; what gets saved comes from Plaid.
function readInstitution(body: Record<string, unknown>): Institution {
  const raw = body.institution;
  if (raw === undefined || raw === null) return { institutionId: null, institutionName: null };
  if (typeof raw !== "object" || Array.isArray(raw)) throw badRequest('"institution" must be an object.');
  const value = raw as Record<string, unknown>;
  return { institutionId: optionalString(value.institution_id, 100), institutionName: optionalString(value.name, 200) };
}

function readAccounts(body: Record<string, unknown>): IncomingAccount[] {
  const raw = body.accounts;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ACCOUNTS) throw badRequest('"accounts" must be a list.');
  return raw.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) throw badRequest("Each account must be an object.");
    const value = entry as Record<string, unknown>;
    const plaidAccountId = optionalString(value.id, 200);
    const name = optionalString(value.name, 300);
    const type = optionalString(value.type, 50);
    if (!plaidAccountId || !name || !type) throw badRequest("Each account needs an id, a name, and a type.");
    return { plaidAccountId, name, mask: optionalString(value.mask, 20), type, subtype: optionalString(value.subtype, 100) };
  });
}

/** Saves the access token first: once exchanged, losing it means linking again. */
async function saveItem(uid: string, itemId: string, accessToken: string, institution: Institution): Promise<void> {
  const now = Date.now();
  const plaidEnv = currentPlaidEnv();
  const batch = getAdminDb().batch();

  batch.set(plaidItemsCollection(uid).doc(itemId), {
    accessToken: encryptSecret(accessToken),
    itemId,
    cursor: "",
    loopStartCursor: "",
    createdAt: now,
    institutionId: institution.institutionId,
    institutionName: institution.institutionName,
    plaidEnv,
    skippedDuplicateAccountIds: [],
    pendingRemovalIds: [],
    carryOverAccountIds: [],
    rebuildStartedAt: null,
    consentCheckedAt: 0,
  });

  batch.set(plaidItemStatusCollection(uid).doc(itemId), {
    institutionName: institution.institutionName,
    plaidEnv,
    needsReauth: false,
    lastSyncedAt: null,
    lastSyncError: null,
    lastSyncErrorAt: null,
    importStatus: "not_ready",
    hasMore: true,
    linkedAt: now,
    consentExpiresAt: null,
    refreshRequestedAt: null,
    rebuildRequestedAt: null,
  });

  await batch.commit();
}

/**
 * Fills in what Plaid reports about the new connection and creates its account
 * docs, reattaching the accounts of a bank that was disconnected earlier.
 */
async function completeConnection(uid: string, itemId: string, accessToken: string): Promise<LinkResult> {
  const [plaidAccounts, details] = await Promise.all([fetchAccounts(accessToken), getItemDetails(accessToken, true)]);

  // Safety net with Plaid's own account list: accounts another live
  // connection already syncs are skipped rather than imported twice.
  const incoming: IncomingAccount[] = plaidAccounts.map((account) => ({
    plaidAccountId: account.account_id,
    name: account.name,
    mask: account.mask ?? null,
    type: account.type,
    subtype: account.subtype ?? null,
  }));
  const duplicates = findLinkedDuplicates(details.institutionId, incoming, await listSavedAccounts(uid), itemId);
  if (incoming.length > 0 && duplicates.length === incoming.length) {
    await disconnectPlaidItem(uid, itemId);
    throw new ApiError(
      409,
      "duplicate_item",
      "These accounts are already connected. Use Manage accounts or Reconnect on the bank's card instead."
    );
  }

  const skipped = duplicates.map((account) => account.plaidAccountId);
  await plaidItemsCollection(uid).doc(itemId).update({
    institutionId: details.institutionId,
    institutionName: details.institutionName,
    skippedDuplicateAccountIds: skipped,
    consentCheckedAt: Date.now(),
  });
  await plaidItemStatusCollection(uid)
    .doc(itemId)
    .set({ institutionName: details.institutionName, consentExpiresAt: details.consentExpiresAt }, { merge: true });

  const reconciled = await reconcileItemAccounts(
    uid,
    itemId,
    { institutionId: details.institutionId, skippedDuplicateAccountIds: skipped },
    plaidAccounts
  );

  return {
    accounts: reconciled.newAccounts,
    skippedDuplicateCount: skipped.length,
    reattachedCount: reconciled.reattachedDocIds.length,
  };
}

export const POST = withUser({ name: "exchange-token", rateLimit: RATE_LIMITS.exchangeToken }, async ({ req, user }) => {
  const startedAt = Date.now();
  const body = await readJsonObject(req);
  const publicToken = requireString(body, "public_token", 256);
  if (!publicToken.startsWith("public-")) {
    throw badRequest('"public_token" is not a Plaid public token.');
  }
  const institution = readInstitution(body);
  const accounts = readAccounts(body);

  // Duplicates are caught before the exchange, because the exchange is what
  // uses up a connection. A refused public token is simply never used.
  const [savedAccounts, savedItems] = await Promise.all([listSavedAccounts(user.uid), listSavedItems(user.uid)]);
  const verdict = assessLink(
    { ...institution, accounts },
    { accounts: savedAccounts, items: savedItems },
    body.confirmDifferentLogin === true
  );
  if (verdict.outcome !== "allow") {
    return NextResponse.json({ error: verdict.code, message: verdict.message, itemId: verdict.itemId }, { status: 409 });
  }

  const exchange = await exchangePublicToken(publicToken);
  const accessToken = exchange.access_token;
  const itemId = exchange.item_id;

  await recordItemCreated(currentPlaidEnv()).catch((err: unknown) => {
    logWarn("exchange-token", "Could not count the new connection", errorFields(err));
  });

  try {
    await saveItem(user.uid, itemId, accessToken, institution);
  } catch (firstErr) {
    logWarn("exchange-token", "Saving the connection failed; retrying once", { itemId, ...errorFields(firstErr) });
    try {
      await saveItem(user.uid, itemId, accessToken, institution);
    } catch (err) {
      // Nothing was saved, so the new Plaid item would be orphaned. Remove it.
      await removeItem(accessToken).catch((removeErr: unknown) => {
        logWarn("exchange-token", "Could not remove unsaved Plaid item", { itemId, ...errorFields(removeErr) });
      });
      throw err;
    }
  }

  let result: LinkResult = { accounts: [], skippedDuplicateCount: 0, reattachedCount: 0 };
  try {
    result = await completeConnection(user.uid, itemId, accessToken);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // The connection is saved, so nothing is lost: the first sync creates its accounts.
    logError("exchange-token", err, { itemId });
  }

  // Respond now; transactions arrive through the live listener. A large import
  // continues in later syncs, which the browser starts while it's running.
  after(async () => {
    await syncItemAndRecord(user.uid, itemId, startedAt + SYNC_BUDGET_MS);
  });

  return NextResponse.json({ success: true, ...result });
});
