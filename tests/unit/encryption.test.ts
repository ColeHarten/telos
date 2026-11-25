import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, decryptSecretWithStatus, encryptSecret } from "@/lib/services/encryption";

const KEY_A = crypto.randomBytes(32).toString("base64");
const KEY_B = crypto.randomBytes(32).toString("base64");

function legacyEncrypt(plaintext: string, base64Key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(base64Key, "base64"), iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

describe("encryption", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY_A;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });

  it("round-trips in the versioned format", () => {
    const stored = encryptSecret("access-sandbox-123");
    expect(stored.startsWith("v1.")).toBe(true);
    expect(decryptSecretWithStatus(stored)).toEqual({ plaintext: "access-sandbox-123", needsReencryption: false });
  });

  it("rejects tampered ciphertext", () => {
    const [version, iv, tag, ciphertext] = encryptSecret("access-sandbox-123").split(".");
    const bytes = Buffer.from(ciphertext, "base64");
    bytes[0] ^= 1;
    expect(() => decryptSecret([version, iv, tag, bytes.toString("base64")].join("."))).toThrow();
  });

  it("decrypts the legacy format and flags it for re-encryption", () => {
    expect(decryptSecretWithStatus(legacyEncrypt("legacy-token", KEY_A))).toEqual({
      plaintext: "legacy-token",
      needsReencryption: true,
    });
  });

  it("uses the previous key during a rotation", () => {
    const stored = encryptSecret("rotate-me");
    process.env.ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(stored)).toThrow();

    process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
    expect(decryptSecretWithStatus(stored)).toEqual({ plaintext: "rotate-me", needsReencryption: true });
  });

  it("rejects a key of the wrong length", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
