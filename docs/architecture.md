# Telos architecture

## Overview

- **Browser:** pages read and write Firestore directly through hooks in `lib/hooks/` (`useAccounts`, `useCategories`, `useBudget`, `useTransactions`, `useAutomations`, `useSettings`). Everything is scoped under `users/{uid}`.
- **Server:** API routes in `app/api/` do everything that needs a secret or must not be trusted to the browser: Plaid calls, token encryption, sync, disconnecting a bank, and deleting an account. Every route goes through `withUser` (`lib/api/handler.ts`), which verifies the Firebase ID token, applies a rate limit, validates the body, and returns errors as `{ error, message }`.
- **Rules:** `firestore.rules` lists every collection explicitly. Anything not listed is denied.
- **Pure logic** sits apart from I/O so it can be unit tested: `lib/services/syncPlanner.ts`, `lib/budgetCalculations.ts`, `lib/paycheck/paycheck.ts`, `lib/merchant.ts`, and the scoring functions in `lib/services/ruleEngine.ts`.

## Data model

All under `users/{uid}/`.

| Collection | Written by | Browser access |
|---|---|---|
| `plaidItems/{itemId}` | Server | None. Holds the encrypted access token, sync cursor, sync lease, and skipped account ids. |
| `plaidItemStatus/{itemId}` | Server | Read. `needsReauth`, `lastSyncedAt`, `lastSyncError`, `institutionName`. |
| `accounts/{accountId}` | Both | Create manual accounts only. Plaid fields and linked-account balances are server-only. Delete is server-only. Linked account ids equal Plaid's `account_id`. |
| `transactions/{transactionId}` | Server | Read, and update `categoryKind`, `categoryId`, `transferAccountId`, `updatedAt` only. Ids equal Plaid's `transaction_id`. |
| `categories/{categoryId}` | Browser | Owner, with `kind` validated (`income`, `expense`, `transfer`). |
| `budgets/{YYYY-MM}` | Browser | Owner. `lines` maps a line id (`category_<id>` or `account_<id>`) to its planned amount. |
| `automations/{merchantKey}` | Browser | Owner. Merchant to category rules. |
| `categoryPlaidStats/{plaidDetailedCode}` | Browser | Owner. Learning votes, `counts: { categoryId: n }`. |
| `settings/*` | Browser | Owner. |

The top-level `rateLimits` collection holds per-user, per-route counters and is server-only.

## Plaid linking

1. `create-link-token` returns a Link token (`create-update-link-token` for reconnecting).
2. `exchange-token` exchanges the public token, saves the encrypted access token, a status doc, and the new accounts in one batch, then responds. The first sync runs afterwards in `after()`.
3. Duplicates: accounts are matched on institution and mask, or on institution, name, and type when there is no mask. Archived accounts count, so the user is told to restore instead of getting a second copy. A link that adds nothing is removed at Plaid.

## Sync pipeline

`/api/plaid/sync` calls `syncAllPlaidItems`, which syncs each connection independently (`lib/services/syncService.ts`):

1. **Lease.** A 2-minute lease on the `plaidItems` doc, taken in a Firestore transaction. If another sync holds it, the connection is reported as in progress and skipped.
2. **Fetch.** `transactions/sync` pages from the stored cursor. On `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` it restarts from the starting cursor (up to 3 times).
3. **Plan.** `planSync` turns Plaid's added, modified, and removed lists plus the existing docs into writes:
   - A new transaction gets the rules applied. A posted transaction copies the category from its pending version (`pending_transaction_id`).
   - An existing transaction gets its Plaid fields updated. Its category is never overwritten; rules rerun only if it is still uncategorized.
   - Removed transactions are deleted.
   - Transactions on skipped accounts are ignored.
4. **Commit** in batches, then refresh balances with `accountsGet`, then save the new cursor (re-encrypting the token if needed) and the status doc.
5. **Errors** are recorded on that connection's status doc. `ITEM_LOGIN_REQUIRED` and similar set `needsReauth`. Other connections keep syncing, and the response lists connections that need reauth, failed, or were in progress.

**Disconnect** (`/api/plaid/disconnect-item`) removes the item at Plaid, deletes its `plaidItems` and status docs, and converts its accounts to manual accounts: history is kept and the balance is frozen.

**Delete** (`/api/accounts/delete`) works on archived accounts only. It is blocked while transactions transfer into the account or a category or paycheck deduction links to it. It stops syncing the account first (disconnecting the bank if no other account uses it, otherwise adding the account to the item's skip list), then deletes the account's transactions and the account.

## Encryption

`lib/services/encryption.ts` uses AES-256-GCM with a random 12-byte IV and a 16-byte tag. Stored format: `v1.<iv>.<tag>.<ciphertext>`, base64 parts. The older unversioned three-part format still decrypts.

Key rotation: set the new key as `ENCRYPTION_KEY` and the old one as `ENCRYPTION_KEY_PREVIOUS`. Tokens that only decrypt with the old key, or are in the old format, are re-encrypted with the new key on that connection's next sync. Once every connection has synced, remove `ENCRYPTION_KEY_PREVIOUS`.

## Categorization

Rules run on the server during sync, in `applyRules` (`lib/services/ruleEngine.ts`). The browser only records the user's choices.

| Tier | Source | Rule |
|---|---|---|
| 1 | Automations | Merchant key to category. Always wins. |
| 2 | Learned Plaid defaults | Plaid's `detailed` category code to the category the user has picked most. |
| none | Needs Review | Left uncategorized. |

A tier whose category was deleted or archived falls through to the next.

**Merchant keys.** `normalizeMerchant` (`lib/merchant.ts`) lowercases, strips non-alphanumerics, and collapses spaces. It is used both when the browser creates an automation and when the server matches one, on `merchantName ?? rawName`. If the two ever normalized differently, automations would silently stop matching.

**Automations.** After a manual categorization, the Transactions page offers to create one. The doc id is the merchant key, so there is at most one rule per merchant, and creating another overwrites it.

**Learned defaults.** Every manual categorization adds a vote to `categoryPlaidStats/{detailedCode}.counts.{categoryId}`. `resolveWinner` picks a category only with at least 3 votes and a lead of at least 2 over the runner-up. `readVotes` also reads the literal `counts.<id>` fields that earlier versions wrote by mistake. Hard-deleting a category prunes its votes.

**Paycheck transfers.** An income category can carry paycheck deductions. Each non-tax deduction linked to an account gets an auto-created transfer category (`sourceIncomeCategoryId`, `sourceDeductionId`), reconciled in one batch whenever the income category is saved: updated and renamed, created, or deleted.

## Budget math

`lib/budgetCalculations.ts`, shared by the Dashboard and Budgets pages:

- **Category actuals** net refunds against spending (and reversals against income) per category per month, floored at 0. Plaid amounts are positive for money out.
- **Archived categories** are totaled separately, so their money is not lost from reports.
- **Cash flow** excludes transfers: anything categorized as a transfer, plus uncategorized transactions Plaid labels `TRANSFER_IN`, `TRANSFER_OUT`, or `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`.
- **Net worth** covers active accounts, using the current balance or, failing that, the starting balance.

Budget lines are saved one field at a time with a merge, so edits from two tabs never overwrite each other.

## Out of scope for now

Production Plaid (webhooks, OAuth redirect, Plaid's production application), editing automations in place, showing learned defaults in the UI, vote decay, a Plaid-primary fallback tier, and multi-currency.
