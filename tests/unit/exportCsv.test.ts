import { describe, expect, it } from "vitest";
import { buildTransactionsCsv, csvCell, toExportTransaction } from "@/lib/exportCsv";

describe("toExportTransaction", () => {
  it("reads a transaction doc", () => {
    expect(
      toExportTransaction("t1", {
        date: "2026-01-05",
        accountId: "acc-1",
        merchantName: "Coffee Shop",
        rawName: "COFFEE SHOP #12",
        amount: 4.5,
        categoryKind: "expense",
        categoryId: "food",
        category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
        pending: false,
      })
    ).toEqual({
      id: "t1",
      date: "2026-01-05",
      accountId: "acc-1",
      description: "Coffee Shop",
      merchant: "Coffee Shop",
      originalDescription: "COFFEE SHOP #12",
      amount: 4.5,
      categoryId: "food",
      categoryKind: "expense",
      plaidCategory: "FOOD_AND_DRINK_COFFEE",
      pending: false,
    });
  });

  it("leaves out transactions Plaid removed", () => {
    expect(toExportTransaction("t1", { removedByPlaid: true })).toBeNull();
  });
});

describe("csvCell", () => {
  it("quotes text and doubles quotes inside it", () => {
    expect(csvCell('Joe\'s "Cafe", NYC')).toBe('"Joe\'s ""Cafe"", NYC"');
    expect(csvCell("")).toBe('""');
  });

  it("stops spreadsheet apps from running text that starts like a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("\"'=HYPERLINK(1)\"");
    expect(csvCell("+1 transfer")).toBe("\"'+1 transfer\"");
    expect(csvCell("@home")).toBe("\"'@home\"");
    expect(csvCell(-5)).toBe("-5");
  });

  it("writes numbers, booleans, and empty values plainly", () => {
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(null)).toBe("");
  });
});

describe("buildTransactionsCsv", () => {
  it("lists newest first, with money in positive and names joined in", () => {
    const base = { merchant: "", originalDescription: "", categoryKind: null, categoryId: null, plaidCategory: "", pending: false };
    const csv = buildTransactionsCsv(
      [
        { ...base, id: "a", date: "2026-01-02", accountId: "acc-1", description: "Store", amount: 10, categoryId: "food", categoryKind: "expense" },
        { ...base, id: "b", date: "2026-01-05", accountId: "acc-1", description: "Payroll", amount: -2500 },
      ],
      { accounts: new Map([["acc-1", "Checking"]]), categories: new Map([["food", "Food"]]) }
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      '"Date","Account","Description","Merchant","Original description","Amount","Category","Category type","Bank category","Pending","Transaction ID"'
    );
    expect(lines[1]).toBe('"2026-01-05","Checking","Payroll","","",2500,"","","",false,"b"');
    expect(lines[2]).toBe('"2026-01-02","Checking","Store","","",-10,"Food","expense","",false,"a"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
