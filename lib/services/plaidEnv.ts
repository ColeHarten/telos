/**
 * The Plaid environment a server runs against, and the one each connection
 * was linked in. Pure, so it can be unit tested.
 */
export type PlaidEnv = "sandbox" | "production";

/** Reads PLAID_ENV. It defaults to sandbox. */
export function parsePlaidEnv(value: string | undefined): PlaidEnv {
  const env = value || "sandbox";
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
  }
  return env;
}

/** The environment a saved connection belongs to. Connections saved before this field existed were sandbox. */
export function storedPlaidEnv(value: unknown): PlaidEnv {
  return value === "production" ? "production" : "sandbox";
}

/**
 * True when a saved connection was linked in a different environment. Its
 * access token only works there, so this server must not sync, change, or
 * remove it.
 */
export function isOtherPlaidEnv(stored: unknown, current: PlaidEnv): boolean {
  return storedPlaidEnv(stored) !== current;
}
