import crypto from "crypto";

/**
 * Encrypts/decrypts secrets before they touch Firestore — currently just
 * Plaid access tokens (see exchange-token/route.ts, syncService.ts,
 * create-update-link-token/route.ts). AES-256-GCM via Node's built-in
 * crypto module: authenticated encryption, so decrypt() throws on any
 * tampering or corruption instead of silently returning garbage — no
 * separate HMAC needed, unlike AES-CBC.
 *
 * ENCRYPTION_KEY must be a base64-encoded 32-byte (256-bit) key, set as a
 * server-only env var (same pattern as PLAID_CLIENT_ID/PLAID_SECRET) —
 * never exposed to the client bundle. See the "how to generate + store
 * this" notes wherever this module is introduced.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce — the standard, recommended size for GCM

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${buf.length}. Generate one with: openssl rand -base64 32`
    );
  }
  return buf;
}

/**
 * Encrypts a plaintext secret for storage. Returns a single string
 * (iv.authTag.ciphertext, each base64) — safe to store directly as one
 * Firestore field.
 */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // must be read after final()

  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

/**
 * Reverses encryptSecret. Throws if the value wasn't produced by
 * encryptSecret with the current ENCRYPTION_KEY — including if the
 * ciphertext or auth tag were altered, since GCM verifies integrity as
 * part of decryption.
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) {
    throw new Error("decryptSecret: malformed input — expected iv.authTag.ciphertext");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}