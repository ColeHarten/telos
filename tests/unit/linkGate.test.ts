import { describe, expect, it } from "vitest";
import {
  assessLink,
  findLinkedDuplicates,
  incomingAccountKey,
  plaidTypeFamily,
  savedAccountKey,
  type IncomingAccount,
  type SavedAccount,
  type SavedItem,
} from "@/lib/services/linkGate";

function incoming(id: string, mask: string | null, overrides: Partial<IncomingAccount> = {}): IncomingAccount {
  return { plaidAccountId: id, name: `Account ${id}`, mask, type: "depository", subtype: "checking", ...overrides };
}

function saved(id: string, overrides: Partial<SavedAccount> = {}): SavedAccount {
  return {
    id,
    name: `Account ${id}`,
    accountType: "cash",
    isArchived: false,
    plaidItemId: "item-1",
    plaidAccountId: id,
    plaidInstitutionId: "ins_1",
    plaidMask: null,
    plaidType: "depository",
    plaidName: null,
    plaidClosed: false,
    ...overrides,
  };
}

const CHASE: SavedItem = { itemId: "item-1", institutionId: "ins_1", institutionName: "Chase" };

function chaseLink(accounts: IncomingAccount[]) {
  return { institutionId: "ins_1", institutionName: "Chase", accounts };
}

const checking = saved("a", { plaidMask: "1111" });
const savings = saved("b", { plaidMask: "2222" });

describe("assessLink", () => {
  it("allows a bank that isn't connected", () => {
    const verdict = assessLink(
      { institutionId: "ins_2", institutionName: "Ally", accounts: [incoming("x", "1111")] },
      { accounts: [checking], items: [CHASE] },
      false
    );
    expect(verdict.outcome).toBe("allow");
  });

  it("refuses a login whose accounts are all connected already", () => {
    const verdict = assessLink(chaseLink([incoming("x", "1111"), incoming("y", "2222")]), { accounts: [checking, savings], items: [CHASE] }, true);
    expect(verdict).toMatchObject({ outcome: "refuse", code: "duplicate_item", itemId: "item-1" });
  });

  it("points to Restore when a matching account is archived", () => {
    const verdict = assessLink(
      chaseLink([incoming("x", "1111")]),
      { accounts: [saved("a", { plaidMask: "1111", isArchived: true })], items: [CHASE] },
      false
    );
    expect(verdict.outcome === "refuse" ? verdict.message : "").toContain("archived");
  });

  it("refuses a login that shares some connected accounts", () => {
    const verdict = assessLink(chaseLink([incoming("x", "1111"), incoming("z", "3333")]), { accounts: [checking, savings], items: [CHASE] }, true);
    expect(verdict).toMatchObject({ outcome: "refuse", code: "duplicate_accounts" });
  });

  it("asks before a second login at a connected bank, and allows it once confirmed", () => {
    const link = chaseLink([incoming("z", "3333")]);
    const state = { accounts: [checking, savings], items: [CHASE] };
    expect(assessLink(link, state, false)).toMatchObject({ outcome: "confirm", code: "same_institution", itemId: "item-1" });
    expect(assessLink(link, state, true).outcome).toBe("allow");
  });

  it("compares Plaid's name, not the user's rename, when there's no mask", () => {
    const verdict = assessLink(
      chaseLink([incoming("x", null, { name: "Plaid Checking" })]),
      { accounts: [saved("a", { name: "Bills", plaidName: "Plaid  checking" })], items: [CHASE] },
      false
    );
    expect(verdict).toMatchObject({ outcome: "refuse", code: "duplicate_item" });
  });

  it("doesn't treat a card and a bank account with the same last four as one account", () => {
    const verdict = assessLink(
      chaseLink([incoming("x", "1111")]),
      { accounts: [saved("card", { plaidMask: "1111", plaidType: "credit", accountType: "credit_card" })], items: [CHASE] },
      false
    );
    expect(verdict.outcome).toBe("confirm");
  });

  it("allows linking a disconnected bank again, so its accounts can be reattached", () => {
    const verdict = assessLink(
      chaseLink([incoming("x", "1111")]),
      { accounts: [saved("a", { plaidMask: "1111", plaidItemId: null, plaidAccountId: null })], items: [] },
      false
    );
    expect(verdict.outcome).toBe("allow");
  });
});

describe("account keys", () => {
  it("groups Plaid account types", () => {
    expect(plaidTypeFamily("brokerage")).toBe("investment");
    expect(plaidTypeFamily("Credit")).toBe("credit");
    expect(plaidTypeFamily("other")).toBe("other");
    expect(plaidTypeFamily(null)).toBe("other");
  });

  it("falls back to the Telos type for docs saved without a Plaid type", () => {
    const card = saved("card", { plaidType: null, accountType: "credit_card", plaidMask: "9999" });
    expect(savedAccountKey(card)).toBe(incomingAccountKey(incoming("x", "9999", { type: "credit" })));
  });
});

describe("findLinkedDuplicates", () => {
  it("finds accounts another live connection to the same bank already syncs", () => {
    const accounts = [
      saved("a", { plaidMask: "1111" }),
      saved("b", { plaidMask: "2222", plaidItemId: "item-new" }),
      saved("c", { plaidMask: "3333", plaidItemId: "item-3", plaidInstitutionId: "ins_2" }),
    ];
    const duplicates = findLinkedDuplicates(
      "ins_1",
      [incoming("p1", "1111"), incoming("p2", "2222"), incoming("p3", "3333")],
      accounts,
      "item-new"
    );
    expect(duplicates.map((account) => account.plaidAccountId)).toEqual(["p1"]);
  });
});
