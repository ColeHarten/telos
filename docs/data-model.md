# Data model

All user data lives in Firestore under `users/{uid}`. Each collection is listed below with its fields and who may write it. TypeScript types are in `lib/types/types.ts`; the access rules are in `firestore.rules` and explained in [Security](security.md).

## At a glance

```
users/{uid}                          Profile
  accounts/{accountId}               Bank and manual accounts
  transactions/{transactionId}       Transactions from Plaid
  categories/{categoryId}            Income, expense, and transfer categories
  budgets/{YYYY-MM}                  One budget per month
  automations/{merchantKey}          Merchant-to-category rules
  categoryPlaidStats/{plaidCode}     Learning votes
  settings/app                       App settings
  plaidItems/{itemId}                Bank connections (server only, secret)
  plaidItemStatus/{itemId}           Bank connection status (browser reads)
  balanceSnapshots/{accountId}_{date}  Daily balance of each linked account (browser reads)

rateLimits/{uid}_{bucket}            Rate-limit counters (server only, top level)
plaidUsage/{env}                     Connections created, across all users (server only, top level)
```

| Collection | Written by | Browser can |
|---|---|---|
| `users/{uid}` | Browser | Read and write its own doc |
| `accounts` | Both | Read; create manual accounts; edit non-Plaid fields. Never delete. |
| `transactions` | Server | Read; change only the category fields |
| `categories` | Browser | Read and write; `kind` must be valid and can't change |
| `budgets` | Browser | Read and write |
| `automations` | Browser | Read and write |
| `categoryPlaidStats` | Browser | Read and write |
| `settings` | Browser | Read and write |
| `plaidItems` | Server | Nothing |
| `plaidItemStatus` | Server | Read |
| `balanceSnapshots` | Server | Read |
| `rateLimits` | Server | Nothing |
| `plaidUsage` | Server | Nothing |

Timestamps are a mix of Firestore server timestamps (browser writes) and millisecond numbers (server writes). Code that reads them handles both.

## `users/{uid}`

The profile, kept in step with the Google account on each visit.

| Field | Type | Notes |
|---|---|---|
| `uid`, `email`, `displayName`, `photoURL` | string | From Firebase Auth |
| `updatedAt` | timestamp | |

## `accounts/{accountId}`

For a linked account, the doc id is Plaid's `account_id`. Manual accounts get a random id.

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `accountType` | string | `cash`, `credit_card`, `investment`, `retirement`, `loan`, `property`, `crypto`, `other_asset`, or `other_liability` |
| `normalBalance` | string | `asset` or `liability` |
| `startingBalance` | number | Balance when the account was added |
| `currentBalance` | number | Latest balance. For linked accounts, refreshed on every sync. |
| `balanceUpdatedAt` | number (ms) | When the server last wrote a balance |
| `isManual` | boolean | `true` for manual accounts and for accounts whose bank was disconnected |
| `isArchived` | boolean | |
| `isContributionEligible` | boolean | Can be linked from a paycheck deduction |
| `plaidAccountId`, `plaidItemId` | string or null | Set for linked accounts. Cleared when the bank is disconnected. The doc id is the Plaid account id it was created with; after a disconnected bank is reattached, `plaidAccountId` can differ from it. |
| `plaidInstitutionId`, `plaidMask` | string or null | The bank and last four digits. Kept after a disconnect, to spot duplicates and to reattach the account when the bank is linked again. |
| `plaidType`, `plaidSubtype`, `plaidName` | string or null | Plaid's account type, subtype, and name (not your rename). Used for duplicate checks. Server only. |
| `plaidClosed` | boolean | `true` when the bank no longer shares the account ("Not shared"). Server only. |
| `createdAt`, `updatedAt` | timestamp | |

Balances are positive numbers for both assets and liabilities. `normalBalance` says which way they count toward net worth.

## `transactions/{transactionId}`

The doc id is Plaid's `transaction_id`. The server writes every field; the browser may change only `categoryKind`, `categoryId`, `transferAccountId`, and `updatedAt`.

| Field | Type | Notes |
|---|---|---|
| `accountId` | string | The account the money moved in |
| `amount` | number | Plaid's sign: **positive is money out**, negative is money in |
| `date` | string | `YYYY-MM-DD` |
| `merchantName` | string or null | Plaid's cleaned merchant name |
| `rawName` | string | The bank's original description |
| `pending` | boolean | |
| `pendingTransactionId` | string or null | On a posted transaction, the id of its pending version |
| `category` | object or null | Plaid's personal finance category, version 2: `{ primary, detailed, confidence_level }` |
| `plaidAccountId`, `plaidItemId` | string | Plaid's account and connection ids |
| `authorizedDate` | string or null | When the purchase was made, if the bank reports it |
| `merchantEntityId` | string or null | Plaid's stable id for the merchant |
| `originalDescription` | string or null | The description exactly as the bank sent it |
| `logoUrl`, `website` | string or null | The merchant's logo and website |
| `paymentChannel` | string or null | `online`, `in store`, or `other` |
| `removedByPlaid` | boolean | `true` once Plaid removes it. Hidden at once and deleted when the sync loop ends. |
| `plaidSeenAt` | number (ms) | When a sync last received it from Plaid. A rebuild deletes what it didn't see again. |
| `categoryKind` | string or null | `income`, `expense`, `transfer`, or null (Needs Review) |
| `categoryId` | string or null | The Telos category |
| `transferAccountId` | string or null | For transfers, the destination account. Stored on the transaction so it survives if the category is later deleted. |
| `createdAt`, `updatedAt` | number or timestamp | |

The browser shows `merchantName`, falling back to `rawName`. Pages read a mapped shape (`Transaction` in `types.ts`) built by `useTransactions`.

## `categories/{categoryId}`

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `kind` | string | `income`, `expense`, or `transfer`. Checked by the rules, and fixed once created. |
| `estimatedMonthly` | number | Default budget amount. For an income category with paycheck details, the computed monthly net. |
| `sortOrder` | number | |
| `isArchived` | boolean | |
| `isDefault` | boolean | Optional |
| `description` | string | Optional |
| `groupId` | string or null | Optional |
| `transferAccountId` | string or null | Transfer categories: the destination account |
| `paycheckDetails` | object or null | Income categories only. See below. |
| `sourceIncomeCategoryId`, `sourceDeductionId` | string or null | Set only on transfer categories created from a paycheck deduction |
| `createdAt`, `updatedAt` | timestamp | |

`paycheckDetails`:

| Field | Type | Notes |
|---|---|---|
| `payFrequency` | string | `weekly`, `biweekly`, `semimonthly`, or `monthly` |
| `grossSalary` | number | Gross pay **per paycheck** |
| `deductions` | array | Each: `id`, `label`, `value`, `kind` (`percentOfGross` or `flatAmount`), `type` (`tax`, `preTaxDeduction`, or `postTaxDeduction`), and an optional `linkedAccountId` |

## `budgets/{YYYY-MM}`

One doc per month, for example `budgets/2026-11`.

| Field | Type | Notes |
|---|---|---|
| `monthKey` | string | Same as the doc id |
| `currency` | string | `USD` |
| `lines` | map | Line id to a line object (below) |
| `updatedAt` | timestamp | |

Line ids are `category_<categoryId>` for income and expense lines, and `account_<accountId>` for savings and debt lines. Each line is `{ id, lineType, categoryId, planned }`, where `categoryId` holds the category or account id. Each line is saved as its own field, so two tabs can't overwrite each other's lines.

## `automations/{merchantKey}`

The doc id is the normalized merchant key, so there is at most one automation per merchant.

| Field | Type | Notes |
|---|---|---|
| `merchantKey` | string | `normalizeMerchant(merchant text)` |
| `merchantLabel` | string | The original text, for display |
| `categoryId` | string | |
| `createdAt` | timestamp | |

## `categoryPlaidStats/{plaidDetailedCode}`

Learning votes, one doc per Plaid detailed category code (for example `FOOD_AND_DRINK_COFFEE`).

| Field | Type | Notes |
|---|---|---|
| `counts` | map | Category id to the number of times you picked it for this code |
| `updatedAt` | timestamp | |

Older docs may also have literal top-level fields named `counts.<categoryId>`, from a past bug. The server reads both. See [Categorization](categorization.md).

## `settings/app`

| Field | Type | Notes |
|---|---|---|
| `currency` | string | `USD` |
| `createdAt`, `updatedAt` | timestamp | |

## `plaidItems/{itemId}` (server only)

One doc per bank connection. The browser has no access at all.

| Field | Type | Notes |
|---|---|---|
| `accessToken` | string | Plaid access token, encrypted (see [Security](security.md)) |
| `itemId` | string | Plaid's item id |
| `cursor` | string | Where the next transactions sync starts |
| `institutionId`, `institutionName` | string or null | |
| `plaidEnv` | string | `sandbox` or `production`. A server never touches a connection from the other environment. |
| `loopStartCursor` | string | Where the current sync loop began. Plaid requires restarting there if data changes mid-loop. |
| `pendingRemovalIds` | string[] | Transactions Plaid removed during the current loop, deleted when it ends |
| `skippedDuplicateAccountIds` | string[] | Plaid accounts at this bank that Telos ignores because another connection already syncs them |
| `carryOverAccountIds` | string[] | Reattached account docs whose re-imported transactions take the old copies' categories. Cleared once history is complete. |
| `rebuildStartedAt` | number (ms) or null | Set while a Rebuild from Plaid runs |
| `consentCheckedAt` | number (ms) | When the consent expiry was last read from Plaid (once a day) |
| `lastSyncStartedAt` | number (ms) | When a sync last started; the least recent goes first |
| `syncLeaseId`, `syncLeaseUntil` | string, number | Present only while a sync, rebuild, or disconnect is running |
| `createdAt` | number (ms) | |

## `plaidItemStatus/{itemId}` (browser reads)

What the browser needs to know about each connection, without the secrets.

| Field | Type | Notes |
|---|---|---|
| `institutionName` | string or null | |
| `needsReauth` | boolean | `true` when you need to reconnect the bank |
| `lastSyncedAt` | timestamp or null | Last successful sync |
| `lastSyncError` | string or null | Plaid error code from the last failed sync |
| `lastSyncErrorAt` | timestamp or null | |
| `plaidEnv` | string | The environment it was linked in |
| `importStatus` | string | `not_ready`, `initial` (about 30 days in), `historical` (all history in), or `unknown` |
| `hasMore` | boolean | A sync stopped part way, or a rebuild is pending |
| `linkedAt` | number (ms) | When the bank was linked |
| `consentExpiresAt` | string or null | ISO date when the bank's consent runs out, if it has one |
| `refreshRequestedAt`, `rebuildRequestedAt` | number (ms) | When Refresh or Rebuild was last pressed, so the browser keeps syncing for a while |

## `balanceSnapshots/{accountId}_{date}` (browser reads)

One doc per linked account per day (UTC), written by every sync, so balance history builds up from the day a bank is linked. Plaid can't supply past balances.

| Field | Type | Notes |
|---|---|---|
| `accountId` | string | The account doc id |
| `date` | string | `YYYY-MM-DD` |
| `current`, `available`, `limit` | number or null | As Plaid reports them |
| `updatedAt` | number (ms) | |

## `rateLimits/{uid}_{bucket}` (server only)

| Field | Type | Notes |
|---|---|---|
| `windowStart` | number (ms) | Start of the current one-minute window |
| `count` | number | Requests in this window |
| `expiresAt` | timestamp | Lets an optional Firestore TTL policy clean up old docs |

## `plaidUsage/{env}` (server only)

Counts connections created in each Plaid environment, across all users. It only goes up, because Plaid doesn't give a connection back when it's removed.

| Field | Type | Notes |
|---|---|---|
| `itemsCreated` | number | Public tokens exchanged since Stage 6 was deployed. Set it by hand to match the Plaid dashboard if connections were used before. |
| `updatedAt` | number (ms) | |

## Indexes

Queries that need a composite index are listed in `firestore.indexes.json`. If Firestore asks for a new one, create it from the link in the error, then export it back into the file with `npx firebase-tools firestore:indexes > firestore.indexes.json`.
