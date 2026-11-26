import { describe, expect, it } from "vitest";
import { isOtherPlaidEnv, parsePlaidEnv, storedPlaidEnv } from "@/lib/services/plaidEnv";

describe("Plaid environment guard", () => {
  it("reads PLAID_ENV, defaulting to sandbox", () => {
    expect(parsePlaidEnv(undefined)).toBe("sandbox");
    expect(parsePlaidEnv("")).toBe("sandbox");
    expect(parsePlaidEnv("production")).toBe("production");
    expect(() => parsePlaidEnv("development")).toThrow();
  });

  it("treats connections saved without an environment as sandbox", () => {
    expect(storedPlaidEnv(undefined)).toBe("sandbox");
    expect(storedPlaidEnv("production")).toBe("production");
  });

  it("flags connections from the other environment", () => {
    expect(isOtherPlaidEnv(undefined, "sandbox")).toBe(false);
    expect(isOtherPlaidEnv("sandbox", "production")).toBe(true);
    expect(isOtherPlaidEnv("production", "sandbox")).toBe(true);
    expect(isOtherPlaidEnv("production", "production")).toBe(false);
  });
});
