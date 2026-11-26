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

4. **Function duration.** The sync and exchange-token routes set `maxDuration = 60` seconds, and a sync stops taking new pages after 40. Check your Vercel plan allows 60.

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
| A bank's card says Needs reconnect or Access expiring | It needs the user to sign in again (`ITEM_LOGIN_REQUIRED`), or its consent is about to run out. Press Reconnect on the card. It doesn't use a connection. |
| A bank's card says Sync failed | The bank's `plaidItemStatus` doc has `lastSyncError`, a Plaid error code. Look it up in Plaid's error docs, and search the logs for that `itemId`. Telos retries on its own. |
| Sync says a bank is "in progress" | Another sync of that bank is running. A stuck lease expires after two minutes. |
| "Too many requests" | A rate limit. Wait a minute. |
| Linking is refused as a duplicate | Nothing was exchanged, so no connection was used. Use Manage accounts or Reconnect on the bank's card, or Restore if the account is archived. |
| A bank card says Other environment | It was linked under the other `PLAID_ENV`. This server won't touch it; use the deployment that matches. |
| An account says Not shared | The bank stopped sharing it. Manage accounts can share it again; otherwise archive it, and delete it if you like. |
| Connections used doesn't match the Plaid dashboard | The count starts when Stage 6 is deployed. Set `plaidUsage/{env}.itemsCreated` to the dashboard's number in the Firebase console. |
| An OAuth bank (Chase, Capital One) is missing from Link, or the return fails | `PLAID_REDIRECT_URI` must be set and listed under Allowed redirect URIs in the Plaid dashboard. Finish in the same browser you started in. |
| Only the last month shows after linking | Normal. Plaid sends about 30 days first and the rest over minutes to hours; the card says "Importing history…" meanwhile. |
| Transactions look wrong or incomplete | Rebuild from Plaid on the bank's card. It re-imports everything and keeps categories. Never clear the database. |
| A category keeps not getting applied automatically | Check the Rules page: only the first matching rule applies, and "Merchant is" needs the whole name. Merchant memory needs the same pick twice in a row. A Plaid mapping assigns only when Plaid is confident; otherwise it's a suggestion in Needs Review. Rules apply to new transactions; use Apply to past for older ones. |
| Permissions errors after changing `firestore.rules` | Deploy the rules. |
| CSP warnings in the browser console | Unless `CSP_ENFORCE=true`, nothing is blocked. Add the missing source in `next.config.ts` if it's legitimate. |
| Every route returns 500 at once | A server env var is missing or malformed. The log shows which, for example `ENCRYPTION_KEY is not set`. |

## Going live with production Plaid

Only connections are irreversible: each new bank login uses one of the plan's connections (10 on the free Trial), and removing it doesn't give it back. Losing a connection's access token, through a deleted `plaidItems` doc or a lost `ENCRYPTION_KEY`, means linking that bank again. Everything else can be fixed later without linking again (see [Plaid and sync](plaid-and-sync.md#what-cant-be-undone)). Do these in order.

1. **Plaid plan.** The Plaid dashboard should show the Trial plan with connections used out of 10. Limited Production can't connect some large OAuth banks (Bank of America, Chase, and Wells Fargo among them). Complete the company and app profiles; some OAuth banks also need registration, which the dashboard shows.
2. **Two Firebase projects.** Production gets its own project; local development and Vercel previews use another. On production, turn on the Blaze plan, scheduled daily backups (`gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d`), and a budget alert.
3. **Rules and indexes.** Deploy to production: `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <prod id>`.
4. **Secrets.** Make a new `ENCRYPTION_KEY` (`openssl rand -base64 32`). Save it, the production `PLAID_SECRET`, and the service account JSON in a password manager before linking anything.
5. **Vercel.** Production gets `PLAID_ENV=production`, the production secret, `PLAID_REDIRECT_URI=https://<your domain>/oauth`, and the production Firebase values. Preview and Development keep the sandbox keys and the development project. Add the redirect URI under Allowed redirect URIs in the Plaid dashboard, and the domain under Authorized domains in Firebase.
6. **Connections already used.** If the dashboard already counts some, set `plaidUsage/production.itemsCreated` to that number in the Firebase console. Set `PLAID_ITEM_LIMIT` if the plan's limit isn't 10.
7. **Clean start.** Clear the production database for the last time, deploy, and sign in. Sign in with a second Google account too, and check it sees nothing of yours.
8. **Before the first link.** Add the starter categories (or your own, with Plaid mappings) and any rules, so transactions are categorized as they arrive.
9. **First link.** Use a desktop browser and start with the least important bank. Wait for the card to stop saying "Importing history…", then check the accounts, balances, and transactions against the bank. Link the rest one at a time. Never link the same login twice: at Chase, PNC, Navy Federal, and Schwab, a second connection can break the first.
10. **Enforce the CSP.** Once a full run-through leaves no CSP warnings in the console, set `CSP_ENFORCE=true` and redeploy.
11. **From then on, never wipe.** Use Rebuild from Plaid, Manage accounts, and Reconnect. Disconnect only a bank you're done with.

### Backups

What can't be rebuilt from Plaid is your own work (categories, assignments, budgets, rules, merchant memory), the balance snapshots, and the `plaidItems` docs with `ENCRYPTION_KEY`. The daily backups cover the database; the password manager covers the key. To restore, create a new database from a backup with `gcloud firestore databases restore`, or copy documents back from it.
