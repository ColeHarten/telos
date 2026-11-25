# Operations

Deploying, routine maintenance, and fixing common problems.

## Deploying

Telos is a standard Next.js app. It's set up for Vercel.

1. **Environment variables.** In the Vercel project, set every variable from `.env.example` (see [Getting started](getting-started.md#3-configure-the-app)). Paste `FIREBASE_SERVICE_ACCOUNT_KEY` as one line of JSON.
2. **Authorized domain.** In Firebase, add the Vercel domain under Authentication > Settings > Authorized domains, or Google sign-in will fail there.
3. **Rules and indexes.** Deploy from the repo whenever they change:

   ```bash
   npx firebase-tools deploy --only firestore:rules,firestore:indexes
   ```

   The repo is the source of truth. Don't edit rules in the Firebase console; the next deploy would overwrite them.

4. **Function duration.** The sync and exchange-token routes set `maxDuration = 60` seconds. Check your Vercel plan allows it.

## Rotating the encryption key

Do this if `ENCRYPTION_KEY` may have leaked, or on a schedule.

1. Generate a new key: `openssl rand -base64 32`.
2. In every environment, set:
   - `ENCRYPTION_KEY` = the **new** key
   - `ENCRYPTION_KEY_PREVIOUS` = the **old** key
3. Redeploy.
4. Each bank's token is re-encrypted with the new key on its next successful sync. Have each user sync at least once (Sync on the Transactions page, or Refresh balances on the Accounts page).
5. Once every connection has synced, remove `ENCRYPTION_KEY_PREVIOUS` and redeploy.

If `ENCRYPTION_KEY_PREVIOUS` is removed too early, connections that haven't synced can't be decrypted, and those banks have to be linked again.

**Never lose the current key.** Without it, every stored token is unreadable and every bank must be linked again.

## Rotating other secrets

| Secret | How |
|---|---|
| Plaid secret | Rotate in the Plaid dashboard, update `PLAID_SECRET`, and redeploy. Existing access tokens keep working. |
| Firebase service account | Create a new key in Firebase, update `FIREBASE_SERVICE_ACCOUNT_KEY`, redeploy, then delete the old key in Google Cloud > IAM > Service accounts. |

## Cleaning up rate-limit counters (optional)

`rateLimits` gains one small doc per user per route. To have Firestore delete old ones, add a TTL policy in Google Cloud > Firestore > Time-to-live on collection group `rateLimits`, field `expiresAt`.

## Reading the logs

Server logs (Vercel > Logs) are JSON lines like:

```json
{"level":"warn","time":"2026-11-25T20:14:03.112Z","scope":"sync","message":"Item needs reauth","itemId":"..."}
```

Filter on `scope` (the route or service name) and `level`. Plaid failures include `plaidErrorCode` and `plaidRequestId`; quote the request id if you contact Plaid support.

## Troubleshooting

| Problem | What to check |
|---|---|
| A bank shows a reconnect warning | It needs the user to sign in again (`ITEM_LOGIN_REQUIRED`). Press Reconnect on the Accounts page. |
| Sync says a bank failed | The bank's `plaidItemStatus` doc has `lastSyncError`, a Plaid error code. Look it up in Plaid's error docs, and search the logs for that `itemId`. |
| Sync says a bank is "in progress" | Another sync of that bank is running. A stuck lease expires after two minutes. |
| "Too many requests" | A rate limit. Wait a minute. |
| Linking says the account is already linked | It's in Telos already. If it's archived, restore it on the Accounts page. |
| New transactions take a moment after linking | Normal. The first sync runs after the link finishes, and Plaid may need a few seconds to prepare data. |
| A category keeps not getting applied automatically | Automations match the merchant key exactly. Check the merchant on the Automations page. Learned defaults need 3 votes with a lead of 2. |
| Permissions errors after changing `firestore.rules` | Deploy the rules. |
| CSP warnings in the browser console | The CSP is report-only, so nothing is blocked. Add the missing source in `next.config.ts` if it's legitimate. |
| Every route returns 500 at once | A server env var is missing or malformed. The log shows which, for example `ENCRYPTION_KEY is not set`. |

## Moving to production Plaid

Not done yet. When it is, it will need:

- Plaid production access approved, and `PLAID_ENV=production` with production keys.
- A webhook route (with signature checks) so banks sync on their own.
- An OAuth redirect page, which some banks require.
- A privacy policy, terms of use, and a delete-my-account option.

Sandbox connections won't work once `PLAID_ENV` is `production`, so use a separate Firebase project for production, or expect to clear sandbox connections and link real banks again.
