# Changes

Running log for the `production-hardening` branch: one section and one commit per stage.

## Stage 8: UX polish

The last stage before go-live, in the same look. No new dependencies, no Firestore rules changes, and no new indexes.

### Added
- **Transactions: bulk select.** Checkboxes on every row, a page checkbox in the header, and Select all for every match. The bar that appears sets a category (`planBulkCategory`, which skips a transfer category on its own account), hides or unhides (`planBulkHidden`), or creates a rule from the selection (`draftRuleFor`: their shared merchant and category).
- **Transactions: detail drawer** (`TransactionDrawer.tsx`): category with why it has it (the rule's wording when a rule set it), your own name, notes, Hide from budgets, and the bank's description, merchant, authorized date, Plaid category, and website. Create rule starts from the transaction's merchant. A new rule from the drawer or a selection offers Apply to past, as on the Rules page.
- **Transactions: Needs Review tab** with its count, **merchant logos** (`components/MerchantAvatar.tsx`: Plaid's logo, else the old icons), and **cards on phones**.
- **Searchable category picker** in every row (`CategoryPicker`, grouped into expenses, income, and transfers), replacing the plain list. Clearing it sends a transaction back to Needs Review.
- **Needs Review count** next to Transactions in the menu. `TransactionsProvider` now wraps the whole signed-in layout, pairs transfers once for every page, and counts Needs Review.
- **Header sync chip** (`components/SyncStatusChip.tsx`): "Synced 5m ago" (the bank synced longest ago), "Syncing…", "Importing history…", or "1 bank needs attention". Click to sync, or to open Accounts. `useAutoSync` now returns each bank's status, and `useSyncRunning` reports whether a sync is running in the tab (the Transactions Sync button follows it too).
- **Dashboard setup checklist** (`SetupChecklist.tsx`): categories, rules, first bank, Needs Review, and a budget, until every step is done once. Hide checklist remembers in the browser.
- **Budgets:** Copy last month and Fill from estimates (`lib/budgetTools.ts`, both confirmed first), and an **Uncategorized** line under Expenses (`uncategorizedSpending`), so actuals add up to cash flow.
- `authorizedDate` and `website` are read into transactions for the drawer.
- Tests: bulk edits and rule drafts (`categorization.test.ts`), uncategorized spending (`budgetCalculations.test.ts`), and `budgetTools.test.ts`.

### Fixed
- **Connect a bank** fetches the link token when the dialog opens, and Continue to Plaid shows a spinner until it's ready, so nothing seems to happen for a second. A prepared token older than 30 minutes is replaced. Cancel works while it loads.
- Docs: Budgets shows money on archived categories in a warning above the lines, not as its own line (Using Telos and Calculations said otherwise), and the Dashboard's planned figures include category estimates, not only amounts saved on Budgets.

### Notes
- Setting a category on selected transactions counts as your pick but doesn't teach merchant memory, like Accept all.
- `docs/`: Using Telos, Calculations, Categorization, Architecture, Data model, and Testing updated for this stage.

## Stage 7: Categorization v2

Monarch-style rules, merchant memory, Plaid mappings, and transfer pairing. No new dependencies or Firestore indexes. Deploy `firestore.rules` with this stage. Nothing is migrated: automations and learning votes are replaced, and the database is cleared at go-live.

### Added
- **Engine** (`lib/categorization.ts`, pure, shared by sync and the browser): your rules, then merchant memory, then Plaid mappings, then Needs Review. A category is skipped when archived, deleted, or a transfer to the transaction's own account.
- **Rules** (`rules/{ruleId}`, Rules page): conditions on merchant (is or contains, ignoring digits), description, accounts, amount range, and direction; actions to set a category, rename, and hide. Priority order with move up and down, an on/off switch, editing in place, and a live match count.
- **Rule prompt** after you categorize a transaction, with "Also apply to past transactions". **Apply to past** on the Rules page: a preview of matches and changes, your own picks left alone unless included. Runs in the browser on the loaded 24 months (`planRuleApplication`, `applyUpdates`).
- **Merchant memory** (`merchantMemory/{key}`): the same pick twice in a row applies to that merchant's new transactions. Keyed on Plaid's merchant id, or the name without digits. Never learns transfers.
- **Plaid mappings** on categories (`plaidCategories`), with the version 2 taxonomy in `lib/plaidCategories.ts`. A detailed mapping beats a primary one. Only confident matches assign; others become suggestions, with one-click accept and **Accept all**.
- **Starter categories** (`lib/starterCategories.ts`): 25 categories with mappings, offered on an empty Categories page.
- **Transfer pairing** (`lib/transfers.ts`): opposite amounts in two of your accounts within 5 days, where one leg looks like a transfer. Paired legs count as transfers and leave Needs Review.
- Transaction fields: `categorySource`, `ruleId`, `suggestedCategoryId`, `customName`, `hidden`, and `notes`. A posted transaction keeps its pending version's name, hiding, and notes, and sync never touches them.
- Tests: `transfers` unit tests; the engine, rules, memory, Apply to past, and starter categories in `categorization`; savings and debt actuals, hidden transactions, and Needs Review in `budgetCalculations`; new fields in `syncPlanner`; rules tests for the new fields, self-transfers, rules, and merchant memory.

### Changed
- Savings and debt actuals count each movement once and net of withdrawals: a linked account from its own transactions, a manual one from transfers categorized to it (was the absolute amount of every transfer categorized to the account).
- Card and loan payments, and loan disbursements, are transfers when uncategorized (was credit-card payments only), and stay out of Needs Review.
- Hidden transactions are left out of budgets, cash flow, summary cards, and Needs Review.
- `firestore.rules`: transactions accept the new fields with type and length checks, and refuse a transfer to the transaction's own account; `rules` and `merchantMemory` replace `automations` and `categoryPlaidStats`; `plaidCategories` must be a list.
- Transactions page: the rule prompt replaces the automation offer; suggestions, a note on how each category was set, Plaid category labels, dimmed hidden rows, and search over the bank's description.
- Archiving a category warns when a rule assigns it.
- `docs/`: Categorization rewritten; the other pages are updated for this stage.

### Removed
- Automations (the page, `useAutomations`, and the prompt) and learning votes (`categoryPlaidStats`, `resolveWinner`, `readVotes`).

### Not in this stage
- Bulk editing, the detail drawer (notes and renaming by hand), the header sync chip, and the dashboard checklist (Stage 8).

## Stage 6: Production Plaid safety

Everything that has to be right before a real bank is linked. No new dependencies. Deploy `firestore.rules` with this stage. No new Firestore indexes.

### Added
- **Duplicate gate** (`lib/services/linkGate.ts`): Link's `onSuccess` metadata is checked against your accounts, including disconnected ones, **before** the public token is exchanged, so a refused link uses no connection. 409 `duplicate_item`, `duplicate_accounts`, or `same_institution` (confirmed with "This is a different login"). After the exchange, Plaid's account list is checked again, and accounts another connection already syncs are skipped.
- **Reattach on relink:** linking a disconnected bank again links its old account docs back, and re-imported transactions take the old copies' categories instead of duplicating them.
- **Connect a bank** step (`ConnectBankDialog.tsx`): lists connected banks with each account's last four digits, and "Connections used: N of 10", counted on the server across all users (`plaidUsage/{env}`, `GET /api/plaid/usage`, `PLAID_ITEM_LIMIT`).
- **Bank connections panel** (`ConnectionsPanel.tsx`): a card per bank with status (Up to date, Importing history…, Needs reconnect, Access expiring, Sync failed, Other environment), last sync, accounts, and Refresh, Manage accounts, Reconnect, Rebuild from Plaid, and Disconnect (typed confirmation, warns that relinking uses another connection).
- **Manage accounts:** update mode with account selection. Every sync reconciles accounts with Plaid (`lib/services/accountReconcile.ts`): creates docs for newly shared accounts, marks unshared ones `plaidClosed` ("Not shared"), and refreshes balances and Plaid details.
- **Resumable sync** (`lib/services/syncLoop.ts`): 500 per page, each page committed with its cursor, the loop's starting cursor kept for Plaid's mid-loop restart rule, removals applied when the loop ends, and a 40-second budget after which the route returns `more` and the browser calls again (`lib/plaidSync.ts`).
- **Freshness:** `importStatus`, `hasMore`, and consent expiry on each bank's status; `useAutoSync` in the signed-in layout syncs on opening when data is over six hours old, every two minutes while importing or after a Refresh, and retries failing banks every 30 minutes. `POST /api/plaid/refresh` (`/transactions/refresh`). Reconnect is offered 14 days before consent expires.
- **Rebuild from Plaid** (`POST /api/plaid/rebuild`): re-imports a bank's full history from an empty cursor, keeping categories; transactions Plaid no longer has are deleted when it finishes.
- **OAuth:** `PLAID_REDIRECT_URI` on new and update-mode link tokens, and an `/oauth` page that resumes Link from the saved session.
- **Environment guard** (`lib/services/plaidEnv.ts`): connections store `plaidEnv`; a server never syncs, changes, or removes a connection from the other environment (409 `wrong_environment`, `itemsOtherEnv`).
- **Captured from the start:** Plaid categories pinned to version 2; authorized date, merchant id, original description, logo, website, payment channel, and category confidence on each transaction; a daily balance snapshot per linked account (`balanceSnapshots`).
- **One transactions listener** (`components/TransactionsProvider.tsx`) for the whole visit, instead of one per page.
- **Export transactions (CSV)** on Settings (`lib/exportCsv.ts`), with a guard against spreadsheet formulas.
- `CSP_ENFORCE=true` enforces the Content Security Policy; Plaid's logo hosts are allowed.
- Tests: `linkGate`, `accountReconcile`, `syncLoop`, `plaidEnv`, `connections`, and `exportCsv` unit tests; more `syncPlanner` cases; rules tests for `balanceSnapshots`, `plaidUsage`, and the new account fields.

### Changed
- Deleting an account never disconnects its bank. It's refused (409 `still_shared`) while the bank still shares the account, and also deletes its balance snapshots.
- Disconnect keeps each account's Plaid details, so relinking can reattach them, and takes the sync lease.
- Last Synced shows the bank synced longest ago, with a note when a bank is importing or needs attention. The dashboard shows when each linked balance was last updated.
- Rate limits: sync 10 per minute (was 6); refresh 4, rebuild 2, and usage 30 are new.
- `firestore.rules`: the browser can't change `plaidType`, `plaidSubtype`, `plaidName`, or `plaidClosed`; `balanceSnapshots` is read-only.
- `.env.example`: `PLAID_REDIRECT_URI`, `PLAID_ITEM_LIMIT`, and `CSP_ENFORCE`.
- `docs/`: Plaid and sync rewritten; the going-live runbook is in Operations; the other pages are updated for this stage.

### Not in this stage
- Rules engine v2 and transfer pairing (Stage 7); bulk editing, the detail drawer, and the header sync chip (Stage 8); webhooks.

## Stage 5: Code review fixes

Fixes from the Telos code review. No new dependencies; `next` and `eslint-config-next` move to 16.4.6.

### Changed
- `.github/workflows/ci.yml`: installs npm 11 before `npm ci` (Node 22's npm 10 rejected the lockfile, so CI never ran); actions moved to v5.
- `package.json`: `next` and `eslint-config-next` 16.2.9 -> 16.4.6 (security releases).
- `next.config.ts`: image optimizer off (`images.unoptimized`); Telos doesn't use `next/image`.
- `.gitignore`: ignores Firebase service-account key files.
- `lib/budgetCalculations.ts`: `plannedAmount` (saved line, else the category estimate).
- Budgets page: totals add up the amounts shown on the lines, including unset lines showing the estimate. Loads transactions far enough back for the selected month.
- Dashboard: planned figures use `plannedAmount`, so they match Budgets. Loads transactions far enough back for the six-month trend.
- `AddCategoryModal.tsx` and `firestore.rules`: a category's type can't change after it's created (it corrupted past transactions and orphaned paycheck transfer categories).
- Transactions page: "Unassigned" is always offered, so a transaction can go back to Needs Review. Summary cards leave out transfers. The automation offer appears only when the change saved and the automation doesn't already exist.
- `useTransactions.ts`: `updateTransactionAssignment` returns whether it saved; optional `sinceMonthKey` widens the loaded window.
- `plaidService.ts`: new links request 730 days of history (Plaid's default is 90).
- `syncService.ts`: disconnect and per-account skip take the sync lease and fail with 409 `sync_in_progress` while a sync runs; a sync of a connection removed in the meantime records nothing; balances skip skipped accounts.
- `app/api/accounts/delete/route.ts`: uses `skipAccountInSync`.
- `usePlaidAccountLink.ts`: the link token is requested on click and dropped when Link closes, instead of on every page load and for every reconnect row.
- `DeleteAccountDialog.tsx`: the safety check runs once per opening, not on every account-list update.
- Accounts and Categories pages: errors are no longer cleared whenever data updates.
- `tests/`: rules tests for `categoryKind` values, clearing an assignment, and locked category kind; unit tests for `plannedAmount`.
- `docs/`: updated for all of the above, plus Sign Out on Settings.

### Not in this stage
- Sign-up allowlist and re-linking a disconnected bank: before production Plaid.
- One shared listener for all pages, and enforcing the CSP: later.

### Apply and test
```bash
rsync -a --delete --exclude .git --exclude node_modules --exclude .next --exclude '.env*' --exclude .vercel \
  --exclude .firebaserc --exclude firestore.indexes.json --exclude package-lock.json \
  --exclude public/favicon.ico --exclude app/assets/favicon.ico ./telos-stage5/ ./
npm install
npm run lint && npm run typecheck && npm test && npm run test:rules && npm run build
```

## Stage 4: Tests, CI, docs, and polish

**New:** `vitest.config.ts`, `tests/` (unit tests, rules tests, and a `server-only` stub), `.github/workflows/ci.yml`, `docs/architecture.md`
**Changed:** `package.json`, `tsconfig.json`, `eslint.config.mjs`, `README.md`, `app/(authenticated)/layout.tsx`, `app/(authenticated)/settings/page.tsx`, `app/login/page.tsx`, `app/(authenticated)/transactions/page.tsx`, `app/(authenticated)/categories/AddCategoryModal.tsx`, `app/(authenticated)/automations/page.tsx`
**Removed:** `todo.md`, `automations.md` (moved into `docs/architecture.md`), `image.png`

- Unit tests: budget math, `normalizeMerchant`, `resolveWinner`, `readVotes`, `applyRules`, `calculateWithholdings`, encryption (round trip, tamper, legacy format, and rotation), and the sync planner (repeat runs, no category overwrite, pending to posted, and uncategorized rerun).
- Rules tests on the emulator: cross-user denial, `plaidItems` and `rateLimits` denial, transaction field limits, and account protections.
- CI: install, lint, typecheck, unit tests, rules tests, and a build with placeholder public config.
- Polish: footer phase text removed; Preferences card removed until it has content; below `md` the drawer opens from a menu button (desktop unchanged); Login redirects to the Dashboard when already signed in; Last Synced shows "Syncing…" during a sync; stray `tsconfig` entry removed; unused imports removed.
- Lint: `react-hooks/set-state-in-effect` is a warning rather than an error. The flagged effects reset state when the user, month, or dialog changes, which is intended.

Commands: `npm test`, `npm run test:rules` (needs Java 21), `npm run typecheck`, `npm run lint`.

## Stage 3: Calculations and data integrity

**New:** `lib/budgetCalculations.ts`, `app/api/accounts/delete/route.ts`
**Changed:** `app/(authenticated)/dashboard/page.tsx`, `app/(authenticated)/budgets/page.tsx`, `app/(authenticated)/accounts/page.tsx`, `app/(authenticated)/accounts/DeleteAccountDialog.tsx`, `app/(authenticated)/transactions/page.tsx`, `app/(authenticated)/categories/AddCategoryModal.tsx`, `components/MonthPickerControl.tsx`, `lib/hooks/useBudget.ts`, `lib/hooks/useCategories.ts`, `lib/hooks/useAccounts.ts`, `lib/services/syncService.ts`, `lib/services/rateLimit.ts`, `app/api/plaid/disconnect-item/route.ts`, `firestore.rules`

- Shared budget math: month helpers, category actuals net of refunds (floored at 0 per category), an archived-category bucket, transfer actuals, cash flow without transfers (categorized ones plus uncategorized Plaid transfers and credit-card payments), and net worth that falls back to starting balance. Dashboard and Budgets both use it.
- Budgets save each edited line as its own merged field. A snapshot from another tab never replaces lines with unsaved local edits.
- Paycheck transfer categories are reconciled in one batch and renamed when the deduction label changes.
- Archived accounts: the destination and deduction pickers keep a linked archived account, labeled "(archived)". The Transactions account filter resets when its account is archived. The duplicate-name check uses active accounts only.
- Disconnect bank (server): revokes the Plaid item, deletes its records, and converts its accounts to manual accounts with history kept and balance frozen.
- Permanent delete (server): archived accounts only. Deletes the account and its own transactions. Still blocked by inbound transfers and by category or deduction links. A linked account stops syncing first.
- Rules: account deletes are server-only. Deploy with `npx firebase-tools deploy --only firestore:rules`.

## Stage 2: Sync engine and data freshness

### New files

| File | What it does |
|---|---|
| `lib/services/syncPlanner.ts` | Pure function that turns Plaid's added, modified, and removed lists plus the existing docs into writes. No I/O, so Stage 4 can unit test it. |

### Changed files

- **`lib/services/syncService.ts`** (rewritten):
  - **Categories are never overwritten.** A transaction Plaid sends again only gets its Plaid fields updated. Rules run only on uncategorized transactions.
  - **Pending to posted:** a posted transaction inherits the category set on its pending version (Plaid's `pending_transaction_id`).
  - **Modified transactions** now update amount, date, names, pending, Plaid category, and account. Before, only amount, name, and pending were updated.
  - **One sync per bank at a time:** a 2-minute lease on each connection. A second sync that starts meanwhile skips that bank instead of writing duplicates.
  - **Restarts pagination** from the saved cursor when Plaid reports that data changed mid-sync.
  - **One failing bank no longer stops the others.** Each failure is recorded on that bank's status doc.
  - **Balances refresh on every sync** (`currentBalance`, `balanceUpdatedAt`).
- **`lib/services/ruleEngine.ts`:** learned categories now work. Votes were saved as literal `counts.<id>` field names, which the server never read; both formats are read now, so existing votes count. `applyRules` is synchronous.
- **`app/api/plaid/exchange-token/route.ts`:**
  - Responds as soon as the bank and accounts are saved, and runs the first sync in the background with `after()`.
  - Duplicate check now includes archived accounts (409 says to restore instead), and matches accounts without a mask on institution, name, and type.
- **`app/api/plaid/sync/route.ts`** (unchanged file): the response now also lists `itemsFailed` and `itemsInProgress`.
- **`lib/hooks/useTransactions.ts`:**
  - Live listener over the last 24 months instead of a one-time read of everything, plus `loadOlderTransactions`.
  - Votes are saved as a nested map.
  - `refetchTransactions` is removed.
- **`lib/hooks/useCategories.ts`:** hard-deleting a category removes its learning votes.
- **`app/(authenticated)/transactions/page.tsx`:**
  - A "Load older transactions" button appears when there is older history.
  - The sync result names banks that need reconnecting or failed.
  - The real server message is shown, for example on a 429.
  - Removed the `any` and two unused imports.
- **`app/(authenticated)/accounts/page.tsx`:** "Refresh Balances" runs a sync instead of reloading the page, and linking a bank no longer reloads the page.

### Environment

No changes. `package.json` is unchanged.

### Apply

Same as Stage 1, with `telos-stage2.zip` and `/tmp/telos-stage2`:

```bash
cd ~/telos && git checkout production-hardening && git pull
rm -rf /tmp/telos-stage2 && mkdir -p /tmp/telos-stage2
unzip -q ~/Downloads/telos-stage2.zip -d /tmp/telos-stage2
# same EXCLUDES=( ... ) as Stage 1, plus your local files:
EXCLUDES+=( --exclude '/firestore.indexes.json' )
rsync -av --delete "${EXCLUDES[@]}" /tmp/telos-stage2/ ./
npm install && npm run build
git add -A && git commit -m "Stage 2: sync engine and data freshness"
```

No rules change in this stage.

### Verify

Use Plaid's dynamic sandbox user, `user_transactions_dynamic` (any password).

1. Link it. The Accounts page returns quickly, and transactions appear on the Transactions page within a few seconds without a refresh.
2. Categorize a pending transaction, then fire a new-transactions webhook from the Plaid dashboard (or wait) and sync. When it posts, the posted copy keeps your category.
3. Press Sync twice quickly (or in two tabs). No duplicate rows and no lost categories.
4. Accounts, then Refresh Balances: balances update and the page does not reload.
5. Correct the category of 3+ transactions that share a Plaid category to the same one. New transactions with that Plaid category are then auto-assigned on sync.

## Stage 1: Security and server foundation

### New files

| File | What it does |
|---|---|
| `firestore.rules` | Lists every collection explicitly, with no recursive wildcard. Browsers can't read `plaidItems`, can only change a transaction's category fields, and can't change Plaid links or linked-account balances. |
| `firebase.json`, `.firebaserc.example` | Deploy the rules from the repo with the Firebase CLI. Also sets up the local emulators. |
| `firestore.indexes.json` | Placeholder. Replace it with your project's export (see "Deploy the rules"). |
| `.env.example` | Every environment variable, with notes. |
| `lib/api/handler.ts` | Wraps every API route: auth (401), per-user rate limit (429 with `Retry-After`), body validation (400), and one error shape, `{ error, message }`. Unexpected errors return a generic 500 and are logged without payloads. |
| `lib/services/rateLimit.ts` | Per-user, per-route counter in the server-only `rateLimits` collection. Sync 6/min, link tokens 10/min, exchange 5/min, and disconnect 10/min. |
| `lib/services/logging.ts` | JSON log lines with safe error fields (Plaid error code, request id, and HTTP status). Tokens, keys, and Plaid payloads are never logged. |

### Changed files

- **All five `app/api/plaid/*/route.ts`:** use the shared wrapper, validate ids and tokens, and are rate limited.
  - `exchange-token` saves the connection, its status doc, and its accounts in one batch. If nothing is saved (a duplicate or an error), the new Plaid item is removed again instead of being left orphaned.
  - `disconnect-item` also deletes the connection's status doc.
- **`lib/services/syncService.ts`:** the reconnect flag and Last Synced time are written to a browser-readable `plaidItemStatus/{itemId}` doc. Tokens in the old format are re-encrypted on the next sync.
- **`lib/hooks/useAccounts.ts`:** reads the reconnect flag and Last Synced from `plaidItemStatus` instead of `plaidItems`.
- **`lib/firebaseAdmin.ts`:** Admin SDK created on first use (`getAdminAuth()`, `getAdminDb()`), so `next build` needs no secrets. A missing or malformed key gives a clear error.
- **`lib/services/plaidService.ts`:** Plaid client created on first use. `PLAID_ENV` picks the environment (default `sandbox`), and Plaid Link shows "Telos".
- **`lib/services/encryption.ts`:** versioned `v1.` format. `ENCRYPTION_KEY_PREVIOUS` supports key rotation, and the old format still decrypts.
- **`lib/services/auth.ts`:** revoked sessions are rejected, and configuration errors return 500 instead of 401.
- **`lib/services/ruleEngine.ts`:** `resolveWinner` is exported for the Stage 4 tests.
- **`lib/hooks/usePlaidAccountLink.ts`:** a failed link-token request no longer re-requests in a loop. The button shows "Try again" instead, and an expired link token is replaced automatically.
- **`lib/authenticatedFetch.ts`:** keeps the caller's headers and sets `Content-Type` only when there's a body.
- **`app/(authenticated)/accounts/page.tsx`:** Restore sends only `isArchived`. It used to re-send balances, which the new rules block on linked accounts.
- **`app/(authenticated)/transactions/page.tsx`:** comments only.
- **`next.config.ts`:** HSTS, `nosniff`, Referrer-Policy, `X-Frame-Options: DENY`, and Permissions-Policy. The Content Security Policy is report-only for now, so it can't break sign-in or Plaid Link.
- **`.gitignore`:** keeps `.env.example`, and ignores `.firebaserc`, `.firebase/`, and Firebase debug logs.
- Every server module starts with `import "server-only"`, so the build fails if browser code imports one. Next.js handles that import itself, so there's no new dependency.

### Environment

- No new required variables.
- Optional: `PLAID_ENV` (`sandbox` or `production`, default `sandbox`) and `ENCRYPTION_KEY_PREVIOUS` (only during a key rotation).
- `package.json` and `package-lock.json` are unchanged.

### Apply

```bash
cd path/to/telos
git checkout main && git pull
git checkout -b production-hardening

rm -rf /tmp/telos-stage1 && mkdir -p /tmp/telos-stage1
unzip -q ~/Downloads/telos-stage1.zip -d /tmp/telos-stage1

EXCLUDES=(
  --exclude '/.git/' --exclude '/node_modules/' --exclude '/.next/' --exclude '/.vercel/'
  --include '/.env.example' --exclude '/.env*' --exclude '/.firebaserc' --exclude '/.firebase/'
  --exclude '/.vscode/' --exclude '/.idea/' --exclude '.DS_Store' --exclude '*.log'
  --exclude '/next-env.d.ts' --exclude '/*.tsbuildinfo'
  --exclude '/public/' --exclude '/app/assets/favicon.ico' --exclude '/image.png'
)

# Preview: this stage deletes nothing, so this should print nothing.
rsync -avn --delete "${EXCLUDES[@]}" /tmp/telos-stage1/ ./ | grep '^deleting'

rsync -av --delete "${EXCLUDES[@]}" /tmp/telos-stage1/ ./
npm install
npm run lint     # send me any errors; older lint issues are fixed in Stage 4
npm run build
git add -A && git commit -m "Stage 1: security and server foundation"
```

### Deploy the rules

Deploy the rules after this branch is running somewhere (locally or as a Vercel preview). The old code on `main` still works under the new rules, except that it loses the reconnect flag and Last Synced, because it reads them from `plaidItems`.

```bash
cp .firebaserc.example .firebaserc        # then set your Firebase project id
npx firebase-tools login
npx firebase-tools firestore:indexes > firestore.indexes.json    # commit this file
npx firebase-tools deploy --only firestore:rules
```

Existing bank connections get their status doc on their next sync, so run one sync after deploying.

### Verify

1. Sign in, then link a sandbox bank (`user_good` / `pass_good`).
2. Press Sync on the Transactions page. Last Synced updates.
3. In the Firebase console Rules Playground, a `get` on `/users/<uid>/plaidItems/<itemId>` is denied and a `get` on `/users/<uid>/plaidItemStatus/<itemId>` is allowed.
4. Press Sync seven times within a minute. The seventh fails (429).
5. Vercel function logs are single-line JSON, with no tokens or keys.
6. The browser console may show `Content-Security-Policy-Report-Only` messages. Send me any that mention Plaid, Google, or Firebase. Ones from `vercel.live` on preview deployments can be ignored.
7. Optional: in the Firestore console, add a TTL policy on the `rateLimits` collection group using the `expiresAt` field, so old counters are deleted.
