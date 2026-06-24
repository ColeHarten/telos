import { adminDb } from "@/lib/firebaseAdmin";
import {
  syncTransactions,
} from "./plaidService";
import { applyRules } from "./ruleEngine";

export async function syncPlaidItem(uid: string, itemId: string) {
  const itemRef = adminDb
    .collection("users")
    .doc(uid)
    .collection("plaidItems")
    .doc(itemId);

  const itemSnap = await itemRef.get();

  if (!itemSnap.exists) throw new Error("Plaid item not found");

  const item = itemSnap.data()!;
  const accessToken = item.accessToken;
  const cursor = item.cursor || "";

  const data = await syncTransactions(accessToken, cursor);

  const txRef = adminDb
    .collection("users")
    .doc(uid)
    .collection("transactions");

  // INSERT + UPDATE
  for (const tx of data.added) {
    const processed = await applyRules(tx);

    await txRef.doc(tx.transaction_id).set({
      id: tx.transaction_id,
      accountId: tx.account_id,
      amount: tx.amount,
      date: tx.date,
      merchantName: tx.merchant_name,
      name: tx.name,
      pending: tx.pending,
      category: tx.personal_finance_category || null,
      cashflowId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...processed,
    });
  }

  for (const tx of data.modified) {
    await txRef.doc(tx.transaction_id).set(
      {
        amount: tx.amount,
        name: tx.name,
        pending: tx.pending,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }

  // DELETE
  for (const tx of data.removed) {
    await txRef.doc(tx.transaction_id).delete();
  }

  // update cursor
  await itemRef.update({
    cursor: data.next_cursor,
  });

  return {
    addedCount: data.added.length,
    modifiedCount: data.modified.length,
    removedCount: data.removed.length,
  };
}

export async function syncAllPlaidItems(uid: string) {
  const itemsSnap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("plaidItems")
    .get();

  let total = {
    added: 0,
    modified: 0,
    removed: 0,
  };

  for (const doc of itemsSnap.docs) {
    const result = await syncPlaidItem(uid, doc.id);

    total.added += result.addedCount;
    total.modified += result.modifiedCount;
    total.removed += result.removedCount;
  }

  return total;
}