import "server-only";

import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";
import type { AccountType, NormalBalance } from "@/lib/types/types";
import { logInfo } from "./logging";

const PLAID_CLIENT_NAME = "Telos";
const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];

type PlaidEnv = "sandbox" | "production";

// PLAID_ENV picks the Plaid environment. It defaults to sandbox.
function getPlaidEnv(): PlaidEnv {
  const value = process.env.PLAID_ENV || "sandbox";
  if (value !== "sandbox" && value !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${value}"`);
  }
  return value;
}

function requireEnv(name: "PLAID_CLIENT_ID" | "PLAID_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let client: PlaidApi | null = null;

// Created on first use, so `next build` and tests don't need Plaid secrets.
function getPlaidClient(): PlaidApi {
  client ??= new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[getPlaidEnv()],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": requireEnv("PLAID_CLIENT_ID"),
          "PLAID-SECRET": requireEnv("PLAID_SECRET"),
        },
      },
    })
  );
  return client;
}

export async function createLinkToken(uid: string) {
  const res = await getPlaidClient().linkTokenCreate({
    user: { client_user_id: uid },
    client_name: PLAID_CLIENT_NAME,
    language: "en",
    products: [Products.Transactions] as Products[],
    country_codes: PLAID_COUNTRY_CODES,
  });

  return res.data.link_token;
}

// Update mode: re-opens Link for an ALREADY-linked item so the user can
// re-enter credentials without creating a new item/access_token. This is
// the actual fix for ITEM_LOGIN_REQUIRED — no amount of retrying the sync
// call resolves it, since the item's login state (not timing) is the
// problem. Passing access_token instead of products is what puts Link into
// update mode; products is omitted since it's not accepted in this mode.
export async function createUpdateModeLinkToken(uid: string, accessToken: string) {
  const res = await getPlaidClient().linkTokenCreate({
    user: { client_user_id: uid },
    client_name: PLAID_CLIENT_NAME,
    language: "en",
    country_codes: PLAID_COUNTRY_CODES,
    access_token: accessToken,
  });

  return res.data.link_token;
}

export async function exchangePublicToken(publicToken: string) {
  const res = await getPlaidClient().itemPublicTokenExchange({
    public_token: publicToken,
  });

  return res.data;
}

export async function fetchAccounts(accessToken: string) {
  const res = await getPlaidClient().accountsGet({
    access_token: accessToken,
  });

  return res.data.accounts;
}

// Right after itemPublicTokenExchange, Plaid needs a moment to prepare the
// item's initial transactions data. Calling transactionsSync before that's
// ready throws PRODUCT_NOT_READY — not a real failure, just "not yet". This
// retries only that specific error, with backoff, and rethrows immediately
// for anything else (an invalid access token should fail fast, not retry).
const PRODUCT_NOT_READY_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

function getPlaidErrorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
}

export { getPlaidErrorCode };

export async function syncTransactions(accessToken: string, cursor?: string) {
  for (let attempt = 0; attempt <= PRODUCT_NOT_READY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await getPlaidClient().transactionsSync({
        access_token: accessToken,
        cursor: cursor || "",
      });
      return res.data;
    } catch (err) {
      const isProductNotReady = getPlaidErrorCode(err) === "PRODUCT_NOT_READY";
      const isLastAttempt = attempt === PRODUCT_NOT_READY_RETRY_DELAYS_MS.length;
      if (!isProductNotReady || isLastAttempt) throw err;
      logInfo("plaid", "PRODUCT_NOT_READY; retrying", { delayMs: PRODUCT_NOT_READY_RETRY_DELAYS_MS[attempt], attempt: attempt + 1 });
      await new Promise((resolve) => setTimeout(resolve, PRODUCT_NOT_READY_RETRY_DELAYS_MS[attempt]));
    }
  }
  // Unreachable — the loop always returns or throws — but satisfies TS.
  throw new Error("syncTransactions: exhausted retries");
}

export async function getInstitutionForItem(accessToken: string) {
  const itemResponse = await getPlaidClient().itemGet({
    access_token: accessToken,
  });

  const institutionId =
    itemResponse.data.item.institution_id;

  if (!institutionId) {
    return null;
  }

  const institutionResponse =
    await getPlaidClient().institutionsGetById({
      institution_id: institutionId,
      country_codes: PLAID_COUNTRY_CODES,
    });

  return {
    institutionId,
    institutionName:
      institutionResponse.data.institution.name,
  };
}

export function mapPlaidAccountType(
  account: {
    type?: string | null;
    subtype?: string | null;
  }
): AccountType {
  const type = account.type?.toLowerCase();
  const subtype = account.subtype?.toLowerCase();

  // Depository accounts
  if (type === "depository") {
    return "cash";
  }

  // Credit cards
  if (type === "credit") {
    return "credit_card";
  }

  // Loans
  if (type === "loan") {
    return "loan";
  }

  // Retirement accounts
  if (
    subtype?.includes("401k") ||
    subtype?.includes("ira") ||
    subtype?.includes("roth")
  ) {
    return "retirement";
  }

  // Investment accounts
  if (type === "investment") {
    return "investment";
  }

  return "other_asset";
}

export function getNormalBalanceFromPlaid(
  account: {
    type?: string | null;
  }
): NormalBalance {
  switch (account.type) {
    case "credit":
    case "loan":
      return "liability";

    default:
      return "asset";
  }
}

// Revokes Plaid's access to this item entirely (used when deleting the last
// account tied to a given Plaid connection). Irreversible on Plaid's side —
// the user would need to re-link via Plaid Link to reconnect this bank.
export async function removeItem(accessToken: string) {
  const res = await getPlaidClient().itemRemove({
    access_token: accessToken,
  });

  return res.data;
}