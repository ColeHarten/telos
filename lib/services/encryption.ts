import "server-only";

import crypto from "crypto";

/**
 * AES-256-GCM encryption for secrets stored in Firestore (Plaid access
 * tokens). GCM is authenticated, so decryption throws on any tampering.
 *
 * Stored format: "v1.<iv>.<authTag>.<ciphertext>", each part base64. The
 * legacy unversioned "<iv>.<authTag>.<ciphertext>" still decrypts and is
 * reported as needing re-encryption.
 *
 * Keys: ENCRYPTION_KEY (current) and the optional ENCRYPTION_KEY_PREVIOUS,
 * kept during a rotation so values written with the old key still decrypt.
 * Each is a base64-encoded 32-byte key: openssl rand -base64 32
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = "v1";

type Parts = { iv: Buffer; authTag: Buffer; ciphertext: Buffer; isLegacy: boolean };

function parseKey(name: string, value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes, got ${key.length}. Generate one with: openssl rand -base64 32`);
  }
  return key;
}

function getCurrentKey(): Buffer {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error("ENCRYPTION_KEY is not set");
  return parseKey("ENCRYPTION_KEY", value);
}

function getPreviousKey(): Buffer | null {
  const value = process.env.ENCRYPTION_KEY_PREVIOUS;
  return value ? parseKey("ENCRYPTION_KEY_PREVIOUS", value) : null;
}

function parseStored(stored: string): Parts {
  const segments = stored.split(".");
  let encoded: string[];
  let isLegacy: boolean;

  if (segments.length === 4 && segments[0] === VERSION) {
    encoded = segments.slice(1);
    isLegacy = false;
  } else if (segments.length === 3) {
    encoded = segments;
    isLegacy = true;
  } else {
    throw new Error("decryptSecret: unrecognized ciphertext format");
  }

  const [iv, authTag, ciphertext] = encoded.map((part) => Buffer.from(part, "base64"));
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("decryptSecret: malformed iv or auth tag");
  }
  return { iv, authTag, ciphertext, isLegacy };
}

function decryptWithKey(key: Buffer, { iv, authTag, ciphertext }: Parts): string {
  // A fixed tag length rejects truncated tags.
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getCurrentKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export type DecryptResult = {
  plaintext: string;
  /** True for the legacy format, or when only the previous key worked. */
  needsReencryption: boolean;
};

export function decryptSecretWithStatus(stored: string): DecryptResult {
  const parts = parseStored(stored);
  const currentKey = getCurrentKey();
  try {
    return { plaintext: decryptWithKey(currentKey, parts), needsReencryption: parts.isLegacy };
  } catch (err) {
    const previousKey = getPreviousKey();
    if (!previousKey) throw err;
    return { plaintext: decryptWithKey(previousKey, parts), needsReencryption: true };
  }
}

export function decryptSecret(stored: string): string {
  return decryptSecretWithStatus(stored).plaintext;
}
