import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";
import { describe, expect, it, vi } from "vitest";
import { planSync, type Assignment, type PlanInput, type WriteOp } from "@/lib/services/syncPlanner";

function plaidTx(id: string, overrides: Partial<Record<string, unknown>> = {}): PlaidTransaction {
  return {
    transaction_id: id,
    account_id: "acc-1",
    amount: 12.5,
    date: "2026-03-05",
    name: "COFFEE SHOP",
    merchant_name: "Coffee Shop",
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
    skippedAccountIds: new Set(),
    categorize: () => NONE,
    now: 1000,
    ...overrides,
  });
}

function opFor(ops: WriteOp[], id: string): WriteOp | undefined {
  return ops.find((op) => op.id === id);
}

describe("planSync", () => {
  it("creates a new transaction with the rules applied", () => {
    const result = plan({ added: [plaidTx("t1")], categorize: () => FOOD });
    expect(result.added).toBe(1);
    expect(opFor(result.ops, "t1")).toMatchObject({ type: "create", data: { categoryId: "food", amount: 12.5 } });
  });

  it("is safe to repeat: an existing transaction is updated, not recreated", () => {
    const categorize = vi.fn(() => DINING);
    const result = plan({ added: [plaidTx("t1")], existing: new Map([["t1", FOOD]]), categorize });
    const op = opFor(result.ops, "t1");
    expect(op?.type).toBe("update");
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

  it("carries the category from pending to posted", () => {
    const categorize = vi.fn(() => DINING);
    const result = plan({
      added: [plaidTx("posted", { pending_transaction_id: "pending" })],
      removed: [{ transaction_id: "pending", account_id: "acc-1" } as RemovedTransaction],
      existing: new Map([["pending", FOOD]]),
      categorize,
    });
    expect(opFor(result.ops, "posted")).toMatchObject({ type: "create", data: { categoryId: "food" } });
    expect(opFor(result.ops, "pending")).toEqual({ type: "delete", id: "pending" });
    expect(categorize).not.toHaveBeenCalled();
  });

  it("creates a transaction delivered twice in one run only once", () => {
    const result = plan({ added: [plaidTx("t1"), plaidTx("t1")] });
    expect(result.ops.filter((op) => op.type === "create")).toHaveLength(1);
  });

  it("ignores skipped accounts and unknown removals", () => {
    const result = plan({
      added: [plaidTx("t1", { account_id: "skipped" })],
      removed: [{ transaction_id: "missing", account_id: "acc-1" } as RemovedTransaction],
      skippedAccountIds: new Set(["skipped"]),
    });
    expect(result.ops).toHaveLength(0);
  });
});
