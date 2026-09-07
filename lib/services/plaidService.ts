import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";
import type { AccountType, NormalBalance } from "@/lib/types/types";

const config = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
      "PLAID-SECRET": process.env.PLAID_SECRET!,
    },
  },
});

export const plaidClient = new PlaidApi(config);

export async function createLinkToken(uid: string) {
  const res = await plaidClient.linkTokenCreate({
    user: { client_user_id: uid },
    client_name: "Budgeting App",
    language: "en",
    products: [Products.Transactions] as Products[],
    country_codes: [CountryCode.Us] as CountryCode[],
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
  const res = await plaidClient.linkTokenCreate({
    user: { client_user_id: uid },
    client_name: "Budgeting App",
    language: "en",
    country_codes: [CountryCode.Us] as CountryCode[],
    access_token: accessToken,
  });

  return res.data.link_token;
}

export async function exchangePublicToken(publicToken: string) {
  const res = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  return res.data;
}

export async function fetchAccounts(accessToken: string) {
  const res = await plaidClient.accountsGet({
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
      const res = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor || "",
      });
      return res.data;
    } catch (err) {
      const isProductNotReady = getPlaidErrorCode(err) === "PRODUCT_NOT_READY";
      const isLastAttempt = attempt === PRODUCT_NOT_READY_RETRY_DELAYS_MS.length;
      if (!isProductNotReady || isLastAttempt) throw err;
      console.log(`[plaidService] PRODUCT_NOT_READY, retrying in ${PRODUCT_NOT_READY_RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1})`);
      await new Promise((resolve) => setTimeout(resolve, PRODUCT_NOT_READY_RETRY_DELAYS_MS[attempt]));
    }
  }
  // Unreachable — the loop always returns or throws — but satisfies TS.
  throw new Error("syncTransactions: exhausted retries");
}

export async function getInstitutionForItem(accessToken: string) {
  const itemResponse = await plaidClient.itemGet({
    access_token: accessToken,
  });

  const institutionId =
    itemResponse.data.item.institution_id;

  if (!institutionId) {
    return null;
  }

  const institutionResponse =
    await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us] as CountryCode[],
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
  const res = await plaidClient.itemRemove({
    access_token: accessToken,
  });

  return res.data;
}