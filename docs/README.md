# Telos documentation

Telos is a personal budgeting app. You link bank accounts through Plaid (or add accounts by hand), sort transactions into categories, plan a monthly budget, and track cash flow and net worth.

It is a Next.js 16 app (App Router) on Firebase Auth and Firestore, with Plaid for bank data and MUI for the interface. Plaid runs in **sandbox** mode (test banks only) unless `PLAID_ENV` is `production`. Read [Going live with production Plaid](operations.md#going-live-with-production-plaid) before linking a real bank.

## Start here

| If you want to… | Read |
|---|---|
| Run the app on your machine | [Getting started](getting-started.md) |
| Understand what each page does | [Using Telos](using-telos.md) |
| See how the pieces fit together | [Architecture](architecture.md) |
| Look up a Firestore collection or field | [Data model](data-model.md) |
| Understand bank linking and sync | [Plaid and sync](plaid-and-sync.md) |
| Understand automatic categorization | [Categorization](categorization.md) |
| Check how a number is calculated | [Calculations](calculations.md) |
| Review the security setup | [Security](security.md) |
| Call or change an API route | [API reference](api-reference.md) |
| Run or write tests | [Testing and CI](testing-and-ci.md) |
| Deploy, rotate keys, or fix a problem | [Operations](operations.md) |

## Five things to know first

1. **Every user's data lives under `users/{uid}` in Firestore.** No user can read another user's data.
2. **The browser reads and writes most data directly**, through React hooks in `lib/hooks/`. `firestore.rules` decides what it may touch.
3. **Anything involving Plaid or a secret runs on the server**, in the API routes under `app/api/`. The browser never sees a Plaid access token.
4. **Telos syncs while it's open.** It syncs on opening when a bank's data is over six hours old, every two minutes while a bank imports its history, and whenever you click the sync chip or press Refresh. There are no webhooks yet, so nothing syncs while Telos is closed.
5. **A category you set is never overwritten.** Sync only fills in categories for transactions that don't have one.

## Glossary

| Term | Meaning |
|---|---|
| **Item** or **connection** | One login at one bank, as Plaid sees it. One item can hold several accounts. Each new one uses one of your Plaid plan's connections, and removing it doesn't give that back. |
| **Linked account** | An account that syncs from Plaid. |
| **Manual account** | An account you added by hand, or a linked account whose bank you disconnected. |
| **Not shared** | A linked account the bank no longer shares with Telos. It keeps its history, and Manage accounts can share it again. |
| **Category kind** | `income`, `expense`, or `transfer`. |
| **Transfer** | Money moving between your own accounts, such as a savings deposit or a credit-card payment. Transfers are left out of cash flow. |
| **Rule** | Conditions (merchant, description, account, amount, direction) and actions (category, rename, hide) applied to new transactions, top rule first. |
| **Merchant memory** | The category you've picked for a merchant twice in a row, applied to its new transactions. |
| **Plaid mapping** | The Plaid categories listed on one of your categories; their transactions land there. |
| **Paired transfer** | Two transactions in your accounts with opposite amounts within 5 days, treated as one transfer. |
| **Archive** | Hide something but keep its history. Archived items can be restored. |
