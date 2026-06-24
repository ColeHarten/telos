import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

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