# Security

How Telos protects user data. Five layers, from the database out:

1. **Firestore rules** decide what the browser can read and write.
2. **API routes** check the user's sign-in token and rate-limit every request.
3. **Encryption** protects Plaid access tokens at rest.
4. **Security headers** harden the pages in the browser.
5. **Safe logging** keeps secrets out of the logs.

## 1. Firestore rules

`firestore.rules` is deployed from the repo. The server uses the Admin SDK, which bypasses the rules; they exist to limit the browser.

**Owner only.** Every rule under `users/{uid}` requires `request.auth.uid == uid`, so no one can reach another user's data.

**No catch-all rule.** Firestore allows a request if *any* matching rule allows it. A wildcard like `match /{document=**}` under `users/{uid}` would quietly re-open `plaidItems`. So every collection is listed on its own, and anything unlisted is denied.

| Collection | Read | Create | Update | Delete |
|---|---|---|---|---|
| `users/{uid}` | Owner | Owner | Owner | Owner |
| `plaidItems` | No | No | No | No |
| `plaidItemStatus` | Owner | No | No | No |
| `transactions` | Owner | No | Owner, category fields only | No |
| `accounts` | Owner | Owner, manual accounts only | Owner, with limits | No |
| `categories` | Owner | Owner, valid `kind` | Owner, valid `kind` | Owner |
| `budgets`, `automations`, `categoryPlaidStats`, `settings` | Owner | Owner | Owner | Owner |
| `rateLimits` (top level) | No | No | No | No |

The limits in detail:

- **Transactions:** an update may change only `categoryKind`, `categoryId`, `transferAccountId`, and `updatedAt`. Amounts, dates, and the rest are Plaid's.
- **Account create:** `isManual` must be `true`, and `plaidItemId` and `plaidAccountId` must be empty. Only the server creates linked accounts.
- **Account update:** may never change `isManual` or any Plaid field. On a linked account, it also may not change `startingBalance`, `currentBalance`, or `balanceUpdatedAt`.
- **Account delete:** server only, because deleting an account also deletes its transactions and must check what links to it.

The rules tests in `tests/rules/` check each of these. See [Testing and CI](testing-and-ci.md).

### Why the browser can't see `plaidItems`

`plaidItems` holds the encrypted access token and the sync cursor. The few things the browser needs (whether a bank needs reconnecting, when it last synced, and its last error) are copied to `plaidItemStatus`, which the browser can read but not write.

## 2. API routes

Every route is wrapped in `withUser` (`lib/api/handler.ts`):

1. **Sign-in check.** The browser sends its Firebase ID token as `Authorization: Bearer <token>` (added by `authenticatedFetch`). The server verifies it with the Admin SDK, also rejecting tokens that have been revoked or belong to a disabled user. Missing or invalid gives **401**.
2. **Rate limit.** A per-user, per-route counter (below). Over the limit gives **429** with a `Retry-After` header.
3. **Input checks.** The body must be a JSON object. `requireString` and `requireId` check each field; ids must match `^[A-Za-z0-9_-]{1,128}$`, so they can't contain a `/` and point somewhere else. Bad input gives **400**.
4. **Errors.** Every error has the same shape, `{ "error": "<code>", "message": "<safe to show>" }`. Unexpected errors give a generic **500** and are logged without their payload.

Routes also check ownership by reading only under `users/{uid}` for the signed-in user. An id from another user simply isn't found.

### Rate limits

Fixed one-minute windows per user, stored in the top-level `rateLimits` collection (`lib/services/rateLimit.ts`):

| Route | Requests per minute |
|---|---|
| Sync | 6 |
| Link tokens (new and update mode) | 10 |
| Exchange token | 5 |
| Disconnect bank | 10 |
| Delete account | 10 |

Each counter doc has an `expiresAt` field. You can add a Firestore TTL policy on it to clean up old counters; it's optional.

## 3. Encryption

Plaid access tokens are encrypted before they're stored (`lib/services/encryption.ts`):

- **Algorithm:** AES-256-GCM, with a random 12-byte IV per value and a 16-byte authentication tag. GCM detects tampering: a changed value fails to decrypt instead of decrypting to garbage.
- **Stored format:** `v1.<iv>.<tag>.<ciphertext>`, each part base64. The `v1` prefix leaves room for a future format.
- **Old format:** values from before the `v1` prefix (`<iv>.<tag>.<ciphertext>`) still decrypt, and are re-encrypted in the new format on that bank's next sync.
- **Key:** `ENCRYPTION_KEY`, a base64 32-byte key. The server refuses a key of the wrong length.
- **Rotation:** set the new key as `ENCRYPTION_KEY` and the old one as `ENCRYPTION_KEY_PREVIOUS`. Steps are in [Operations](operations.md#rotating-the-encryption-key).

The token is decrypted only on the server, only when needed for a Plaid call, and is never sent to the browser or logged.

## 4. Security headers

Set for every page in `next.config.ts`:

| Header | Effect |
|---|---|
| `Strict-Transport-Security` | Browsers use HTTPS only, for two years, including subdomains |
| `X-Content-Type-Options: nosniff` | Browsers don't guess file types |
| `Referrer-Policy: strict-origin-when-cross-origin` | Other sites see only the origin, not full URLs |
| `X-Frame-Options: DENY`, and `frame-ancestors 'none'` in the CSP | Telos can't be embedded in another site (stops clickjacking) |
| `Permissions-Policy` | Camera, microphone, location, and payment APIs are off |
| `Content-Security-Policy-Report-Only` | See below |

The `X-Powered-By` header is also turned off.

**Content Security Policy.** The CSP lists the sources Telos needs: itself, Plaid Link, Firebase, and Google sign-in. It currently ships in **report-only** mode, so the browser logs violations in the console but blocks nothing. Once the console is clean in normal use, rename the header to `Content-Security-Policy` in `next.config.ts` to enforce it.

## 5. Logging

Server logs are one JSON line each, with `level`, `time`, `scope`, and `message` (`lib/services/logging.ts`).

Plaid SDK errors carry the Plaid secret and the access token inside them, so **raw error objects are never logged.** `errorFields` copies only safe fields: the error name and message, HTTP status, Plaid's error code and type, and Plaid's request id. Logs refer to connections by item id, never by token.

## Secrets checklist

| Secret | Lives in | Never |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Server env only | In the repo, or prefixed `NEXT_PUBLIC_` |
| `PLAID_SECRET` | Server env only | Same |
| `ENCRYPTION_KEY` (and `_PREVIOUS`) | Server env only | Same. Losing it means every bank must be linked again. |
| Plaid access tokens | `plaidItems`, encrypted | Sent to the browser or logged |

The `NEXT_PUBLIC_FIREBASE_*` values are public by design; the rules are what protect the data.
