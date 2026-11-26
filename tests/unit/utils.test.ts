import { describe, expect, it } from "vitest";
import { formatCurrency, formatSignedCurrency, formatTransactionAmount } from "@/lib/utils";

describe("formatCurrency", () => {
  it("always shows cents", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(12)).toBe("$12.00");
    expect(formatCurrency(-45)).toBe("-$45.00");
  });

  it("never shows negative zero", () => {
    expect(formatCurrency(-0)).toBe("$0.00");
  });
});

describe("formatTransactionAmount", () => {
  it("shows money out with a minus and money in with a plus", () => {
    expect(formatTransactionAmount(45)).toBe("-$45.00");
    expect(formatTransactionAmount(-1200)).toBe("+$1,200.00");
    expect(formatTransactionAmount(0)).toBe("$0.00");
  });
});

describe("formatSignedCurrency", () => {
  it("adds a plus to positive totals only", () => {
    expect(formatSignedCurrency(120)).toBe("+$120.00");
    expect(formatSignedCurrency(-45)).toBe("-$45.00");
    expect(formatSignedCurrency(0)).toBe("$0.00");
  });
});
