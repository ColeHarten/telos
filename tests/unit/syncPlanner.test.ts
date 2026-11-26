import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";
import { describe, expect, it, vi } from "vitest";
import {
  buildLegacyIndex,
  planSync,
  toCategorizeInput,
  toPlaidFields,
  toStoredTransaction,
  type Assignment,
  type LegacyTransaction,
  type PlanInput,
  type StoredTransaction,
  type WriteOp,
} from "@/lib/services/syncPlanner";

function plaidTx(id: string, overrides: Partial<Record<string, unknown>> = {}): PlaidTransaction {
  return {
    transaction_id: id,
    account_id: "acc-1",
    amount: 12.5,
    date: "2026-03-05",
    authorized_date: null,
    name: "COFFEE SHOP",
    merchant_name: "Coffee Shop",
    payment_channel: "in store",
    pending: false,
    pending_transaction_id: null,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE", confidence_level: "HIGH" },
    ...overrides,
  } as unknown as PlaidTransaction;
}

const FOOD: Assignment = { categoryKind: "expense", categoryId: "food", transferAccountId: null };
const DINING: Assignment = { categoryKind: "expense", categoryId: "dining", transferAccountId: null };
const NONE: Assignment = { categoryKind: null, categoryId: null, transferAccountId: null };

function plan(overrides: Partial<PlanInput>) {
  return planSync({
    added: [],
    modified: [],
    removed: [],
    existing: new Map(),
    // "skipped" stands for an account that doesn't sync.
    accountDocIdFor: (plaidAccountId) => (plaidAccountId === "skipped" ? null : plaidAccountId),
    itemId: "item-1",
    categorize: () => NONE,
    now: 1000,
    ...overrides,
  });
}

function opFor(ops: WriteOp[], id: string): WriteOp | undefined {
  return ops.find((op) => op.id === id);
}

function legacyTx(overrides: Partial<LegacyTransaction> = {}): LegacyTransaction {
  return {
    id: "old-1",
    accountId: "doc-old",
    date: "2026-03-05",
    amount: 12.5,
    rawName: "COFFEE SHOP",
    pending: false,
    assignment: FOOD,
    ...overrides,
  };
}

describe("planSync", () => {
  it("creates a new transaction with the rules applied", () => {
    const result = plan({ added: [plaidTx("t1")], categorize: () => FOOD });
    expect(result.added).toBe(1);
    expect(opFor(result.ops, "t1")).toMatchObject({
      type: "create",
      data: { categoryId: "food", amount: 12.5, accountId: "acc-1", plaidItemId: "item-1", plaidSeenAt: 1000, removedByPlaid: false },
    });
  });

  it("is safe to repeat: an existing transaction is updated, not recreated", () => {
    const categorize = vi.fn(() => DINING);
    const result = plan({ added: [plaidTx("t1")], existing: new Map([["t1", FOOD]]), categorize });
    expect(opFor(result.ops, "t1")?.type).toBe("update");
    expect(result.added).toBe(0);
    expect(categorize).not.toHaveBeenCalled();
  });

  it("never overwrites a category on a modified transaction", () => {
    const result = plan({
      modified: [plaidTx("t1", { amount: 99 })],
      existing: new Map([["t1", FOOD]]),
      categorize: () => DINING,
    });
    const op = opFor(result.ops, "t1");
    expect(op).toMatchObject({ type: "update", data: { amount: 99 } });
    expect(op && op.type === "update" ? "categoryId" in op.data : true).toBe(false);
    expect(result.modified).toBe(1);
  });

  it("reruns the rules on a modified transaction that is still uncategorized", () => {
    const result = plan({
      modified: [plaidTx("t1")],
      existing: new Map([["t1", NONE]]),
      categorize: () => DINING,
    });
    expect(opFor(result.ops, "t1")).toMatchObject({ type: "update", data: { categoryId: "dining" } });
  });

  it("carries the category from pending to posted, and only marks the pending copy removed", () => {
    const categorize = vi.fn(() => DINING);
    const result = plan({
      added: [plaidTx("posted", { pending_transaction_id: "pending" })],
      removed: [{ transaction_id: "pending", account_id: "acc-1" } as RemovedTransaction],
      existing: new Map([["pending", FOOD]]),
      categorize,
    });
    expect(opFor(result.ops, "posted")).toMatchObject({ type: "create", data: { categoryId: "food" } });
    expect(opFor(result.ops, "pending")).toEqual({ type: "markRemoved", id: "pending", data: { removedByPlaid: true, updatedAt: 1000 } });
    expect(result.markedRemovedIds).toEqual(["pending"]);
    expect(categorize).not.toHaveBeenCalled();
  });

  it("restores a transaction that comes back after being marked removed", () => {
    const result = plan({ added: [plaidTx("t1")], existing: new Map([["t1", FOOD]]) });
    expect(opFor(result.ops, "t1")).toMatchObject({ type: "update", data: { removedByPlaid: false } });
  });

  it("creates a transaction delivered twice in one page only once", () => {
    const result = plan({ added: [plaidTx("t1"), plaidTx("t1")] });
    expect(result.ops.filter((op) => op.type === "create")).toHaveLength(1);
  });

  it("ignores accounts that don't sync and unknown removals", () => {
    const result = plan({
      added: [plaidTx("t1", { account_id: "skipped" })],
      removed: [{ transaction_id: "missing", account_id: "acc-1" } as RemovedTransaction],
    });
    expect(result.ops).toHaveLength(0);
  });

  it("writes to the account doc a reattached account maps to", () => {
    const result = plan({
      added: [plaidTx("t1", { account_id: "acc-new" })],
      accountDocIdFor: (plaidAccountId) => (plaidAccountId === "acc-new" ? "doc-old" : null),
    });
    expect(opFor(result.ops, "t1")).toMatchObject({ type: "create", data: { accountId: "doc-old", plaidAccountId: "acc-new" } });
  });

  it("gives a re-imported transaction the category of the copy it replaces, and deletes that copy", () => {
    const categorize = vi.fn(() => DINING);
    const result = plan({
      added: [plaidTx("t-new", { account_id: "acc-new" })],
      accountDocIdFor: (plaidAccountId) => (plaidAccountId === "acc-new" ? "doc-old" : null),
      legacy: buildLegacyIndex([legacyTx()]),
      categorize,
    });
    expect(opFor(result.ops, "t-new")).toMatchObject({ type: "create", data: { categoryId: "food" } });
    expect(opFor(result.ops, "old-1")).toEqual({ type: "delete", id: "old-1" });
    expect(result.carriedOver).toBe(1);
    expect(categorize).not.toHaveBeenCalled();
  });

  it("never matches a pending copy with a posted one", () => {
    const result = plan({
      added: [plaidTx("t-new", { account_id: "acc-new" })],
      accountDocIdFor: (plaidAccountId) => (plaidAccountId === "acc-new" ? "doc-old" : null),
      legacy: buildLegacyIndex([legacyTx({ pending: true })]),
      categorize: () => DINING,
    });
    expect(opFor(result.ops, "t-new")).toMatchObject({ type: "create", data: { categoryId: "dining" } });
    expect(opFor(result.ops, "old-1")).toBeUndefined();
    expect(result.carriedOver).toBe(0);
  });
});

describe("planSync with Stage 7 fields", () => {
  it("stores the engine's source, rule, rename, and hiding on a new transaction", () => {
    const result = plan({
      added: [plaidTx("t1")],
      categorize: () => ({ ...DINING, categorySource: "rule", ruleId: "r1", customName: "Cafe", hidden: true }),
    });
    const op = opFor(result.ops, "t1");
    expect(op).toMatchObject({
      type: "create",
      data: { categoryId: "dining", categorySource: "rule", ruleId: "r1", customName: "Cafe", hidden: true, notes: null },
    });
    expect(op && op.type === "create" ? Object.values(op.data).includes(undefined) : true).toBe(false);
  });

  it("fills empty user fields when the engine leaves them out", () => {
    const result = plan({ added: [plaidTx("t1")], categorize: () => NONE });
    expect(opFor(result.ops, "t1")).toMatchObject({
      data: { categorySource: null, ruleId: null, suggestedCategoryId: null, customName: null, hidden: false, notes: null },
    });
  });

  it("carries your rename, hiding, and notes from the pending copy", () => {
    const pending: StoredTransaction = { ...FOOD, categorySource: "user", customName: "Lunch", hidden: true, notes: "With Sam" };
    const result = plan({
      added: [plaidTx("posted", { pending_transaction_id: "pending" })],
      existing: new Map([["pending", pending]]),
    });
    expect(opFor(result.ops, "posted")).toMatchObject({
      data: { categoryId: "food", categorySource: "user", customName: "Lunch", hidden: true, notes: "With Sam" },
    });
  });

  it("saves Plaid's suggestion on an uncategorized update, and only when it changes", () => {
    const suggest = () => ({ ...NONE, suggestedCategoryId: "food" });
    const first = plan({ modified: [plaidTx("t1")], existing: new Map([["t1", NONE]]), categorize: suggest });
    expect(opFor(first.ops, "t1")).toMatchObject({ data: { suggestedCategoryId: "food" } });

    const again = plan({
      modified: [plaidTx("t1")],
      existing: new Map([["t1", { ...NONE, suggestedCategoryId: "food" }]]),
      categorize: suggest,
    });
    const op = opFor(again.ops, "t1");
    expect(op && op.type === "update" ? "suggestedCategoryId" in op.data : true).toBe(false);
  });

  it("never touches your rename or notes on an update", () => {
    const result = plan({
      modified: [plaidTx("t1", { amount: 13 })],
      existing: new Map([["t1", { ...FOOD, customName: "Lunch", notes: "Keep" }]]),
    });
    const op = opFor(result.ops, "t1");
    expect(op && op.type === "update" ? "customName" in op.data || "notes" in op.data : true).toBe(false);
  });
});

describe("toStoredTransaction", () => {
  it("reads malformed fields as empty", () => {
    expect(
      toStoredTransaction({ categoryKind: "savings", categoryId: 4, categorySource: "magic", hidden: "yes", customName: "" })
    ).toEqual({
      categoryKind: null,
      categoryId: null,
      transferAccountId: null,
      categorySource: null,
      ruleId: null,
      suggestedCategoryId: null,
      customName: null,
      hidden: false,
      notes: null,
    });
  });
});

describe("toCategorizeInput", () => {
  it("passes Plaid's category and confidence to the engine", () => {
    const input = toCategorizeInput(toPlaidFields(plaidTx("t1"), "acc-1", "item-1", 5));
    expect(input).toMatchObject({
      accountId: "acc-1",
      merchantName: "Coffee Shop",
      plaidPrimary: "FOOD_AND_DRINK",
      plaidDetailed: "FOOD_AND_DRINK_COFFEE",
      plaidConfidence: "HIGH",
    });
  });
});

describe("toPlaidFields", () => {
  it("copies what Plaid sends and never writes undefined", () => {
    const fields = toPlaidFields(
      plaidTx("t1", {
        authorized_date: "2026-03-04",
        merchant_entity_id: "m-1",
        logo_url: "https://plaid-merchant-logos.plaid.com/coffee.png",
        original_description: "COFFEE SHOP #123 NYC",
      }),
      "acc-1",
      "item-1",
      5
    );
    expect(fields).toMatchObject({
      authorizedDate: "2026-03-04",
      merchantEntityId: "m-1",
      logoUrl: "https://plaid-merchant-logos.plaid.com/coffee.png",
      originalDescription: "COFFEE SHOP #123 NYC",
      paymentChannel: "in store",
      website: null,
      plaidSeenAt: 5,
    });
    expect(Object.values(fields).every((value) => value !== undefined)).toBe(true);
  });
});
