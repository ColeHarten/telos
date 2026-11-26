# Testing and CI

Telos has two kinds of automated tests, and CI runs both on every push.

## Running tests

```bash
npm test             # unit tests, a few seconds
npm run test:rules   # Firestore rules tests, needs Java 21
```

`test:rules` downloads the Firebase CLI if needed, starts the Firestore emulator under the throwaway project id `demo-telos`, runs the tests, and shuts the emulator down. It never touches your real Firebase project.

## Unit tests (`tests/unit/`)

They cover the pure logic, with no database or network.

| File | Covers |
|---|---|
| `syncPlanner.test.ts` | New transactions get rules; repeat runs don't duplicate; categories are never overwritten; uncategorized modified transactions get the rules again; pending categories carry to posted; skipped accounts are ignored |
| `categorization.test.ts` | `normalizeMerchant`, `resolveWinner` thresholds, `readVotes` with old and new formats, `applyRules` order and fallthrough, and paycheck math |
| `budgetCalculations.test.ts` | Month helpers, refunds netting, the zero floor, archived actuals, transfer detection, cash flow, and net worth |
| `encryption.test.ts` | Round trip, tamper detection, the old format, key rotation, and key length checks |

Server modules start with `import "server-only"`, which throws outside Next.js. `vitest.config.ts` swaps it for an empty stub (`tests/serverOnlyStub.ts`) so tests can import them.

## Rules tests (`tests/rules/`)

`firestore.rules.test.ts` loads `firestore.rules` into the emulator and tries real reads and writes as different users.

| Area | Checks |
|---|---|
| Ownership | You can read your data; another user and a signed-out user can't |
| Server-only data | `plaidItems` and `rateLimits` are fully denied; `plaidItemStatus` is read-only |
| Transactions | Category fields can change; Plaid fields can't; no create or delete |
| Accounts | Only manual accounts can be created; a manual balance can be edited; a linked account's balance and Plaid fields can't; no delete |
| Categories | `kind` must be `income`, `expense`, or `transfer` |

**Change `firestore.rules`? Add a test** for the new behavior in this file, both an allowed case and a denied one.

## CI (`.github/workflows/ci.yml`)

Runs on pushes to `main` and `production-hardening`, and on pull requests. On Ubuntu with Node 22 and Java 21, in order:

1. `npm install -g npm@11` (Node 22 ships npm 10, which rejects lockfiles written by npm 11)
2. `npm ci`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm run test:rules`
7. `npm run build`, with placeholder public Firebase values (the build needs no secrets)

Any failing step fails the run. Click the failed step in the **Actions** tab to see its log.

## Lint warnings

`react-hooks/set-state-in-effect` is set to **warn**, not error, in `eslint.config.mjs`. A few pages reset state inside effects on purpose (for example, going back to page 1 when a filter changes). Those show as warnings and don't fail CI.

## Manual smoke test

Before a release, run through this on sandbox with `user_transactions_dynamic`:

1. Sign in with Google.
2. Link a bank. Accounts appear at once, transactions a few seconds later.
3. Press Sync. Last Synced updates.
4. Categorize a transaction and accept the automation offer.
5. Set a budget line, reload, and check it stuck.
6. Archive an account, check it leaves net worth, then restore it.
7. Disconnect the bank. Its accounts become manual with history kept.
8. Archive one of those accounts and delete it permanently.
