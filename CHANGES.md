# Changes

Running log for the `production-hardening` branch: one section and one commit per stage.

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
