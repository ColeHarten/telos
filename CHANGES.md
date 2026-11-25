# Changes

Running log for the `production-hardening` branch: one section and one commit per stage.

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
