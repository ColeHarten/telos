import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { ApiError, readJsonObject, requireId, withUser } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { logInfo } from "@/lib/services/logging";
import { RATE_LIMITS } from "@/lib/services/rateLimit";

const DELETE_PAGE_SIZE = 400;

type AccountDoc = { isArchived?: boolean; plaidItemId?: string | null; plaidClosed?: boolean };
type CategoryDoc = {
  name?: string;
  transferAccountId?: string | null;
  paycheckDetails?: { deductions?: { linkedAccountId?: string | null }[] } | null;
};

/** Links from other data that would dangle if the account were deleted. */
async function blockingReasons(userRef: DocumentReference, accountId: string): Promise<string[]> {
  const reasons: string[] = [];

  const inbound = await userRef.collection("transactions").where("transferAccountId", "==", accountId).limit(1).get();
  if (!inbound.empty) reasons.push("Transactions are categorized as transfers to this account.");

  const categories = (await userRef.collection("categories").get()).docs.map((d) => d.data() as CategoryDoc);
  const transferCategory = categories.find((c) => c.transferAccountId === accountId);
  if (transferCategory) reasons.push(`The category "${transferCategory.name ?? ""}" transfers into this account.`);
  const deductionCategory = categories.find((c) =>
    c.paycheckDetails?.deductions?.some((d) => d.linkedAccountId === accountId)
  );
  if (deductionCategory) {
    reasons.push(`A paycheck deduction on "${deductionCategory.name ?? ""}" contributes to this account.`);
  }

  return reasons;
}

/** Deletes the account's docs in one of the user's collections, a page at a time. */
async function deleteForAccount(userRef: DocumentReference, collection: string, accountId: string): Promise<number> {
  const db = getAdminDb();
  let deleted = 0;
  for (;;) {
    const page = await userRef.collection(collection).where("accountId", "==", accountId).limit(DELETE_PAGE_SIZE).get();
    if (page.empty) break;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += page.size;
    if (page.size < DELETE_PAGE_SIZE) break;
  }
  return deleted;
}

// Permanently deletes an archived account with its transactions and balance
// history. An account its bank still shares would come back at the next sync,
// so it has to stop being shared first (Manage accounts on the bank's card),
// or its bank be disconnected. Deleting an account never disconnects a bank.
export const POST = withUser({ name: "delete-account", rateLimit: RATE_LIMITS.deleteAccount }, async ({ req, user }) => {
  const accountId = requireId(await readJsonObject(req), "accountId");

  const userRef = getAdminDb().collection("users").doc(user.uid);
  const accountRef = userRef.collection("accounts").doc(accountId);
  const snap = await accountRef.get();
  if (!snap.exists) throw new ApiError(404, "not_found", "Account not found.");

  const account = snap.data() as AccountDoc;
  if (!account.isArchived) {
    throw new ApiError(409, "not_archived", "Only archived accounts can be permanently deleted.");
  }
  if (account.plaidItemId && account.plaidClosed !== true) {
    throw new ApiError(
      409,
      "still_shared",
      "Its bank still shares this account. Stop sharing it with Manage accounts on the bank's card, or disconnect the bank, then delete it."
    );
  }

  const reasons = await blockingReasons(userRef, accountId);
  if (reasons.length > 0) {
    throw new ApiError(409, "account_in_use", `This account can't be deleted yet: ${reasons.join(" ")}`);
  }

  const deletedTransactions = await deleteForAccount(userRef, "transactions", accountId);
  await deleteForAccount(userRef, "balanceSnapshots", accountId);
  await accountRef.delete();
  logInfo("delete-account", "Account deleted", { deletedTransactions });

  return NextResponse.json({ success: true, deletedTransactions });
});
