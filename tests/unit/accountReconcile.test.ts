import { describe, expect, it } from "vitest";
import { planAccountReconcile, type PlaidAccountSnapshot, type ReconcileInput } from "@/lib/services/accountReconcile";
import type { SavedAccount } from "@/lib/services/linkGate";

function plaid(id: string, mask: string | null, overrides: Partial<PlaidAccountSnapshot> = {}): PlaidAccountSnapshot {
  return {
    plaidAccountId: id,
    name: "Checking",
    mask,
    type: "depository",
    subtype: "checking",
    officialName: null,
    accountType: "cash",
    normalBalance: "asset",
    current: 100,
    available: 100,
    limit: null,
    ...overrides,
  };
}

function doc(id: string, overrides: Partial<SavedAccount> = {}): SavedAccount {
  return {
    id,
    name: "Checking",
    accountType: "cash",
    isArchived: false,
    plaidItemId: "item-1",
    plaidAccountId: id,
    plaidInstitutionId: "ins_1",
    plaidMask: null,
    plaidType: "depository",
    plaidName: "Checking",
    plaidClosed: false,
    ...overrides,
  };
}

function reconcile(overrides: Partial<ReconcileInput>) {
  return planAccountReconcile({
    itemId: "item-1",
    institutionId: "ins_1",
    plaidAccounts: [],
    saved: [],
    skippedPlaidAccountIds: new Set(),
    ...overrides,
  });
}

describe("planAccountReconcile", () => {
  it("creates a doc for a new account, keyed by its Plaid id", () => {
    const plan = reconcile({ plaidAccounts: [plaid("p1", "1111")] });
    expect(plan.creates.map((account) => account.plaidAccountId)).toEqual(["p1"]);
    expect(plan.docIdByPlaidId.get("p1")).toBe("p1");
  });

  it("keeps docs that are already linked", () => {
    const plan = reconcile({ plaidAccounts: [plaid("p1", "1111")], saved: [doc("p1", { plaidMask: "1111" })] });
    expect(plan.unchanged.map((entry) => entry.docId)).toEqual(["p1"]);
    expect(plan.creates).toEqual([]);
    expect(plan.closed).toEqual([]);
  });

  it("creates a doc for an account shared later through Manage accounts", () => {
    const plan = reconcile({
      plaidAccounts: [plaid("p1", "1111"), plaid("p2", "2222")],
      saved: [doc("p1", { plaidMask: "1111" })],
    });
    expect(plan.creates.map((account) => account.plaidAccountId)).toEqual(["p2"]);
  });

  it("marks an account that's no longer shared as closed, and reopens it when it's shared again", () => {
    const closed = reconcile({
      plaidAccounts: [plaid("p1", "1111")],
      saved: [doc("p1", { plaidMask: "1111" }), doc("p2", { plaidMask: "2222" })],
    });
    expect(closed.closed).toEqual(["p2"]);

    const reopened = reconcile({
      plaidAccounts: [plaid("p1", "1111"), plaid("p2", "2222")],
      saved: [doc("p1", { plaidMask: "1111" }), doc("p2", { plaidMask: "2222", plaidClosed: true })],
    });
    expect(reopened.reopened).toEqual(["p2"]);
    expect(reopened.closed).toEqual([]);
  });

  it("leaves skipped accounts out without closing them", () => {
    const plan = reconcile({
      plaidAccounts: [plaid("p1", "1111"), plaid("p2", "2222")],
      saved: [doc("p1", { plaidMask: "1111" }), doc("p2", { plaidMask: "2222" })],
      skippedPlaidAccountIds: new Set(["p2"]),
    });
    expect(plan.docIdByPlaidId.has("p2")).toBe(false);
    expect(plan.creates).toEqual([]);
    expect(plan.closed).toEqual([]);
  });

  it("reattaches a disconnected bank's account by type and last four", () => {
    const plan = reconcile({
      plaidAccounts: [plaid("p-new", "1111")],
      saved: [doc("old-doc", { plaidItemId: null, plaidAccountId: null, plaidMask: "1111" })],
    });
    expect(plan.reattached.map((entry) => entry.docId)).toEqual(["old-doc"]);
    expect(plan.docIdByPlaidId.get("p-new")).toBe("old-doc");
    expect(plan.creates).toEqual([]);
  });

  it("never reattaches a manual account or another bank's account", () => {
    const plan = reconcile({
      plaidAccounts: [plaid("p-new", "1111")],
      saved: [
        doc("manual", { plaidItemId: null, plaidAccountId: null, plaidInstitutionId: null, plaidMask: "1111" }),
        doc("other-bank", { plaidItemId: null, plaidAccountId: null, plaidInstitutionId: "ins_2", plaidMask: "1111" }),
      ],
    });
    expect(plan.reattached).toEqual([]);
    expect(plan.creates.map((account) => account.plaidAccountId)).toEqual(["p-new"]);
  });

  it("follows an account Plaid now reports under a new id", () => {
    const plan = reconcile({
      plaidAccounts: [plaid("p-new", "1111")],
      saved: [doc("p-old", { plaidMask: "1111" })],
    });
    expect(plan.reattached.map((entry) => entry.docId)).toEqual(["p-old"]);
    expect(plan.closed).toEqual([]);
  });

  it("uses each old doc once", () => {
    const plan = reconcile({
      plaidAccounts: [plaid("p1", "1111"), plaid("p2", "1111")],
      saved: [doc("old-doc", { plaidItemId: null, plaidAccountId: null, plaidMask: "1111" })],
    });
    expect(plan.reattached.map((entry) => entry.docId)).toEqual(["old-doc"]);
    expect(plan.creates.map((account) => account.plaidAccountId)).toEqual(["p2"]);
  });
});
