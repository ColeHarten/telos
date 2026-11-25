import { NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { ApiError, readJsonObject, requireId, withUser } from "@/lib/api/handler";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { logInfo } from "@/lib/services/logging";
import { RATE_LIMITS } from "@/lib/services/rateLimit";
import { disconnectPlaidItem, plaidItemsCollection } from "@/lib/services/syncService";

const DELETE_PAGE_SIZE = 400;

type AccountDoc = { isArchived?: boolean; plaidItemId?: string | null };
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

// Permanently deletes an archived account and its own transactions. A linked
// account stops syncing first: its bank is disconnected if no other account
// uses it, otherwise the account is added to the connection's skip list.
export const POST = withUser({ name: "delete-account", rateLimit: RATE_LIMITS.deleteAccount }, async ({ req, user }) => {
  const accountId = requireId(await readJsonObject(req), "accountId");

  const db = getAdminDb();
  const userRef = db.collection("users").doc(user.uid);
  const accountRef = userRef.collection("accounts").doc(accountId);
  const snap = await accountRef.get();
  if (!snap.exists) throw new ApiError(404, "not_found", "Account not found.");

  const account = snap.data() as AccountDoc;
  if (!account.isArchived) {
    throw new ApiError(409, "not_archived", "Only archived accounts can be permanently deleted.");
  }

  const reasons = await blockingReasons(userRef, accountId);
  if (reasons.length > 0) {
    throw new ApiError(409, "account_in_use", `This account can't be deleted yet: ${reasons.join(" ")}`);
  }

  const itemId = account.plaidItemId;
  if (itemId) {
    const siblings = await userRef.collection("accounts").where("plaidItemId", "==", itemId).get();
    if (siblings.docs.every((d) => d.id === accountId)) {
      await disconnectPlaidItem(user.uid, itemId);
    } else {
      await plaidItemsCollection(user.uid)
        .doc(itemId)
        .update({ skippedDuplicateAccountIds: FieldValue.arrayUnion(accountId) });
    }
  }

  let deletedTransactions = 0;
  for (;;) {
    const page = await userRef.collection("transactions").where("accountId", "==", accountId).limit(DELETE_PAGE_SIZE).get();
    if (page.empty) break;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deletedTransactions += page.size;
    if (page.size < DELETE_PAGE_SIZE) break;
  }

  await accountRef.delete();
  logInfo("delete-account", "Account deleted", { deletedTransactions });

  return NextResponse.json({ success: true, deletedTransactions });
});
