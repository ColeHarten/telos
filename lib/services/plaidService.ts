import "server-only";

import {
  Configuration,
  CountryCode,
  PersonalFinanceCategoryVersion,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type LinkTokenCreateRequest,
} from "plaid";
import type { AccountType, NormalBalance } from "@/lib/types/types";
import { logInfo } from "./logging";
import { parsePlaidEnv, type PlaidEnv } from "./plaidEnv";

const PLAID_CLIENT_NAME = "Telos";
const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];
/** Transactions per /transactions/sync page. 500 is Plaid's maximum. */
const SYNC_PAGE_SIZE = 500;

/** PLAID_ENV picks the Plaid environment. It defaults to sandbox. */
export function currentPlaidEnv(): PlaidEnv {
  return parsePlaidEnv(process.env.PLAID_ENV);
}

function requireEnv(name: "PLAID_CLIENT_ID" | "PLAID_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Where OAuth banks (Chase, Capital One, and others) send the user back to.
 * Must also be listed under Allowed redirect URIs in the Plaid dashboard.
 */
function redirectUri(): string | undefined {
  return process.env.PLAID_REDIRECT_URI || undefined;
}

let client: PlaidApi | null = null;

// Created on first use, so `next build` and tests don't need Plaid secrets.
function getPlaidClient(): PlaidApi {
  client ??= new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[currentPlaidEnv()],
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

export async function createLinkToken(uid: string): Promise<string> {
  const request: LinkTokenCreateRequest = {
    user: { client_user_id: uid },
    client_name: PLAID_CLIENT_NAME,
    language: "en",
    products: [Products.Transactions],
    // Added when the bank supports them, so brokerage, retirement, and loan
    // accounts are shared too. A bank without them can still be linked.
    optional_products: [Products.Investments, Products.Liabilities],
    country_codes: PLAID_COUNTRY_CODES,
    // Plaid's maximum. The default is 90 days, and it can't be raised after linking.
    transactions: { days_requested: 730 },
  };
  const uri = redirectUri();
  if (uri) request.redirect_uri = uri;

  const res = await getPlaidClient().linkTokenCreate(request);
  return res.data.link_token;
}

/**
 * Update mode: reopens Link for a connection that already exists, so the user
 * can sign in again (Reconnect) or change which accounts are shared (Manage
 * accounts, with accountSelection). No new connection is created and no token
 * is exchanged.
 */
export async function createUpdateModeLinkToken(uid: string, accessToken: string, accountSelection: boolean): Promise<string> {
  const request: LinkTokenCreateRequest = {
    user: { client_user_id: uid },
    client_name: PLAID_CLIENT_NAME,
    language: "en",
    country_codes: PLAID_COUNTRY_CODES,
    access_token: accessToken,
  };
  if (accountSelection) request.update = { account_selection_enabled: true };
  const uri = redirectUri();
  if (uri) request.redirect_uri = uri;

  const res = await getPlaidClient().linkTokenCreate(request);
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

// Right after an exchange, Plaid can answer PRODUCT_NOT_READY for a moment.
// That one error is retried with backoff; anything else fails fast.
const PRODUCT_NOT_READY_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

function getPlaidErrorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
}

export { getPlaidErrorCode };

/** One page of /transactions/sync, with Plaid's v2 categories and the bank's original description. */
export async function syncTransactionsPage(accessToken: string, cursor: string) {
  for (let attempt = 0; attempt <= PRODUCT_NOT_READY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await getPlaidClient().transactionsSync({
        access_token: accessToken,
        cursor: cursor || "",
        count: SYNC_PAGE_SIZE,
        options: {
          include_original_description: true,
          // Pinned, so categories never change meaning under Telos's rules.
          personal_finance_category_version: PersonalFinanceCategoryVersion.V2,
        },
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
  // Unreachable: the loop always returns or throws.
  throw new Error("syncTransactionsPage: exhausted retries");
}

/** Asks Plaid to check the bank for new transactions now. They arrive at the next sync. */
export async function refreshTransactions(accessToken: string): Promise<void> {
  await getPlaidClient().transactionsRefresh({ access_token: accessToken });
}

export type ItemDetails = {
  institutionId: string | null;
  institutionName: string | null;
  /** When the user's consent at an OAuth bank runs out (ISO 8601), or null. */
  consentExpiresAt: string | null;
};

export async function getItemDetails(accessToken: string, withInstitutionName = false): Promise<ItemDetails> {
  const { item } = (await getPlaidClient().itemGet({ access_token: accessToken })).data;
  const institutionId = item.institution_id ?? null;
  let institutionName = item.institution_name ?? null;

  if (withInstitutionName && institutionId && !institutionName) {
    const res = await getPlaidClient().institutionsGetById({
      institution_id: institutionId,
      country_codes: PLAID_COUNTRY_CODES,
    });
    institutionName = res.data.institution.name;
  }

  return { institutionId, institutionName, consentExpiresAt: item.consent_expiration_time ?? null };
}

// Plaid investment subtypes that are retirement accounts.
const RETIREMENT_SUBTYPE_PARTS = ["401", "403", "457", "ira", "roth", "pension", "retirement", "thrift savings", "profit sharing", "keogh", "sarsep"];

export function mapPlaidAccountType(
  account: {
    type?: string | null;
    subtype?: string | null;
  }
): AccountType {
  const type = account.type?.toLowerCase();
  const subtype = account.subtype?.toLowerCase() ?? "";

  if (type === "depository") return "cash";
  if (type === "credit") return "credit_card";
  if (type === "loan") return "loan";
  if (RETIREMENT_SUBTYPE_PARTS.some((part) => subtype.includes(part))) return "retirement";
  if (type === "investment" || type === "brokerage") return "investment";
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

/**
 * Revokes Plaid's access to a connection. Irreversible: linking the bank again
 * creates a new connection, which uses another of the plan's connections.
 */
export async function removeItem(accessToken: string) {
  const res = await getPlaidClient().itemRemove({
    access_token: accessToken,
  });

  return res.data;
}
