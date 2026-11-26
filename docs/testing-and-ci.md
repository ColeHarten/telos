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
| `syncPlanner.test.ts` | New transactions get rules; repeat runs and repeated pages don't duplicate; categories are never overwritten; uncategorized modified transactions get the rules again; pending categories carry to posted; removals are marked, then undone if the transaction comes back; reattached accounts and re-imported transactions keep their categories |
| `syncLoop.test.ts` | Paging with the cursor saved after each page, stopping on time and resuming, restarting where the loop began after a mid-loop change, giving up after repeated restarts, and Plaid's update status |
| `linkGate.test.ts` | Duplicate checks before the exchange: a fully connected login, a partly connected one, a second login at a connected bank, archived matches, renamed accounts, a card and a bank account with the same last four, and a disconnected bank |
| `accountReconcile.test.ts` | New accounts, accounts shared later, accounts no longer shared (and shared again), skipped accounts, and reattaching a disconnected bank's accounts |
| `connections.test.ts` | Bank status, consent warnings, sync age, the status caption, and when the browser syncs on its own |
| `plaidEnv.test.ts` | Reading `PLAID_ENV` and spotting connections from the other environment |
| `exportCsv.test.ts` | CSV quoting, the formula guard, and the export's order and signs |
| `categorization.test.ts` | Merchant keys, rule matching (merchant, description, account, amount, direction), the engine's order (rules, merchant memory, Plaid mappings, suggestions), skipped categories, Apply to past and your picks, accepting suggestions, parsing stored rules and memory, starter categories, bulk edits (set category, hide, and a rule from a selection), and paycheck math |
| `transfers.test.ts` | Transfer labels, and pairing: opposite amounts, the 5-day window, a transfer label on one leg, skipped categories and hidden transactions, destinations, and closest dates first |
| `budgetCalculations.test.ts` | Month helpers, refunds netting, the zero floor, archived actuals, transfer detection (paired legs, card and loan payments), savings and debt actuals counted once, hidden transactions, Needs review, uncategorized spending, cash flow, and net worth |
| `budgetTools.test.ts` | Copy last month (estimates for lines never set, lines for removed categories ignored) and Fill from estimates |
| `utils.test.ts` | The currency format, amounts with their direction, and signed totals |
| `dateGroups.test.ts` | Day headings (today, yesterday, this year, other years, and across a daylight saving change) and grouping by day |
| `encryption.test.ts` | Round trip, tamper detection, the old format, key rotation, and key length checks |

Server modules start with `import "server-only"`, which throws outside Next.js. `vitest.config.ts` swaps it for an empty stub (`tests/serverOnlyStub.ts`) so tests can import them.

## Rules tests (`tests/rules/`)

`firestore.rules.test.ts` loads `firestore.rules` into the emulator and tries real reads and writes as different users.

| Area | Checks |
|---|---|
| Ownership | You can read your data; another user and a signed-out user can't |
| Server-only data | `plaidItems`, `rateLimits`, and `plaidUsage` are fully denied; `plaidItemStatus` and `balanceSnapshots` are read-only |
| Transactions | Category fields, name, hiding, and notes can change within limits; no transfer to the transaction's own account; Plaid fields can't change; no create or delete |
| Rules and merchant memory | You can write your own with the required fields; another user can't |
| Accounts | Only manual accounts can be created; a manual balance can be edited; a linked account's balance, Plaid fields, and what Plaid reports about it can't; no delete |
| Categories | `kind` must be `income`, `expense`, or `transfer`, and can't change; `plaidCategories` must be a list |

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
2. Link a bank. Accounts appear at once under a card for the bank, which says "Importing history…"; transactions follow within seconds.
3. Link the same test user at the same bank again. Telos refuses before exchanging anything, and Connections used doesn't change.
4. Press Manage accounts on the card, stop sharing one account, then share it again. It shows "Not shared", then syncs again.
5. Click the sync chip, then press Refresh on the card, then Rebuild from Plaid in its menu. Categories survive the rebuild.
6. Add the starter categories, then categorize a transaction and create the offered rule with Also apply to past transactions. Check the matches change and your own picks don't. Accept a suggestion, and check a paired transfer shows as a transfer on both accounts.
7. Set a budget line, reload, and check it stuck. Use Copy last month and Fill from estimates, and check the Uncategorized line matches the Needs review tab's money out for the month.
8. On Transactions, select a few, set a category, hide them, and create a rule from them. Open a transaction's details, rename it, add a note, and reload. Check the menu's Needs review count and the sync chip, use a filter chip and Show more, and narrow the window to check the cards, the tab bar, and More.
9. Export transactions from Settings and open the file.
10. Archive an account, check it leaves net worth, then restore it.
11. Disconnect the bank (type DISCONNECT). Its accounts become manual with history kept. Link it again: the accounts come back as linked, with their categories.
12. Archive an account at a disconnected bank and delete it permanently.
13. Sign in with a second Google account and check it sees none of the first one's data.
