import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
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
    products: ["transactions"],
    country_codes: ["US"],
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

export async function syncTransactions(accessToken: string, cursor?: string) {
  const res = await plaidClient.transactionsSync({
    access_token: accessToken,
    cursor: cursor || "",
  });

  return res.data;
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
      country_codes: ["US"],
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