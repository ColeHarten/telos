import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Runs against the Firestore emulator: npm run test:rules
let env: RulesTestEnvironment;

const manualAccount = {
  name: "Cash",
  accountType: "cash",
  normalBalance: "asset",
  startingBalance: 100,
  currentBalance: 100,
  isManual: true,
  isArchived: false,
  plaidItemId: null,
  plaidAccountId: null,
};

const linkedAccount = {
  ...manualAccount,
  name: "Checking",
  isManual: false,
  plaidItemId: "item-1",
  plaidAccountId: "linked",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-telos",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/alice/plaidItems/item-1"), { accessToken: "v1.secret", cursor: "" });
    await setDoc(doc(db, "users/alice/plaidItemStatus/item-1"), { needsReauth: false });
    await setDoc(doc(db, "users/alice/accounts/manual"), manualAccount);
    await setDoc(doc(db, "users/alice/accounts/linked"), linkedAccount);
    await setDoc(doc(db, "users/alice/categories/food"), { name: "Food", kind: "expense" });
    await setDoc(doc(db, "users/alice/transactions/t1"), {
      accountId: "linked",
      amount: 12,
      categoryKind: null,
      categoryId: null,
      transferAccountId: null,
    });
    await setDoc(doc(db, "rateLimits/alice_sync"), { count: 1 });
  });
});

function alice() {
  return env.authenticatedContext("alice").firestore();
}

describe("ownership", () => {
  it("lets a user read their own data", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice/categories/food")));
  });

  it("denies another user", async () => {
    const bob = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(bob, "users/alice/categories/food")));
    await assertFails(setDoc(doc(bob, "users/alice/categories/new"), { name: "X", kind: "expense" }));
  });

  it("denies signed-out access", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/alice/categories/food")));
  });
});

describe("server-only collections", () => {
  it("denies all browser access to plaidItems", async () => {
    await assertFails(getDoc(doc(alice(), "users/alice/plaidItems/item-1")));
    await assertFails(setDoc(doc(alice(), "users/alice/plaidItems/item-2"), { accessToken: "x" }));
  });

  it("allows reading plaidItemStatus but not writing it", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice/plaidItemStatus/item-1")));
    await assertFails(updateDoc(doc(alice(), "users/alice/plaidItemStatus/item-1"), { needsReauth: true }));
  });

  it("denies rateLimits", async () => {
    await assertFails(getDoc(doc(alice(), "rateLimits/alice_sync")));
  });
});

describe("transactions", () => {
  it("allows changing the category assignment", async () => {
    await assertSucceeds(
      updateDoc(doc(alice(), "users/alice/transactions/t1"), { categoryKind: "expense", categoryId: "food" })
    );
  });

  it("denies changing Plaid fields", async () => {
    await assertFails(updateDoc(doc(alice(), "users/alice/transactions/t1"), { amount: 1 }));
  });

  it("denies creating and deleting", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice/transactions/t2"), { amount: 5 }));
    await assertFails(deleteDoc(doc(alice(), "users/alice/transactions/t1")));
  });
});

describe("accounts", () => {
  it("allows creating a manual account only", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/accounts/new"), manualAccount));
    await assertFails(setDoc(doc(alice(), "users/alice/accounts/fake"), linkedAccount));
  });

  it("allows editing a manual account's balance", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "users/alice/accounts/manual"), { currentBalance: 250 }));
  });

  it("protects a linked account's balance and Plaid fields", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "users/alice/accounts/linked"), { name: "Main checking" }));
    await assertFails(updateDoc(doc(alice(), "users/alice/accounts/linked"), { currentBalance: 1 }));
    await assertFails(updateDoc(doc(alice(), "users/alice/accounts/linked"), { plaidItemId: null }));
  });

  it("denies deleting accounts from the browser", async () => {
    await assertFails(deleteDoc(doc(alice(), "users/alice/accounts/manual")));
  });
});

describe("categories", () => {
  it("validates kind", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/categories/rent"), { name: "Rent", kind: "expense" }));
    await assertFails(setDoc(doc(alice(), "users/alice/categories/bad"), { name: "Bad", kind: "savings" }));
  });
});
