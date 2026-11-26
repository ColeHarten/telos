# API reference

All routes are `POST`, live under `app/api/`, and use `withUser` (see [Security](security.md#2-api-routes)).

## Calling a route

From the browser, use `authenticatedFetch`, which adds the sign-in token and a JSON content type when there's a body:

```ts
import { authenticatedFetch } from "@/lib/authenticatedFetch";

const res = await authenticatedFetch("/api/plaid/disconnect-item", {
  method: "POST",
  body: JSON.stringify({ itemId }),
});
const body = await res.json();
if (!res.ok) showError(body.message);
```

## Errors

Every error response looks like this:

```json
{ "error": "rate_limited", "message": "Too many requests. Please wait a moment and try again." }
```

`message` is always safe to show the user.

| Status | `error` | When |
|---|---|---|
| 400 | `bad_request` | The body isn't a JSON object, or a field is missing or invalid |
| 401 | `unauthorized` | No token, or the token is invalid, expired, or revoked |
| 404 | `not_found` | The connection or account doesn't exist for this user |
| 409 | varies | The request conflicts with current data (see each route) |
| 429 | `rate_limited` | Over the per-minute limit. See the `Retry-After` header. |
| 500 | `internal_error` | Anything unexpected. Details go to the server log only. |

## Routes

All routes take and return JSON. Bodies marked optional may be left out.

### `POST /api/plaid/create-link-token`

Starts linking a new bank. The token asks for Transactions, plus Investments and Liabilities where the bank has them, 730 days of history, and `PLAID_REDIRECT_URI` when it's set.

- **Body:** none
- **Returns:** `{ "linkToken": "link-sandbox-..." }`
- **Rate limit:** 10 per minute (shared with the update-mode route)

### `POST /api/plaid/create-update-link-token`

Reopens Link for an existing connection (update mode). Nothing is exchanged afterwards, and no connection is used.

- **Body:** `{ "itemId": "...", "accountSelection": true }`. `accountSelection` is optional: `true` for Manage accounts, left out for Reconnect.
- **Returns:** `{ "linkToken": "..." }`
- **Errors:** 404 `not_found` if the connection doesn't exist. 409 `wrong_environment` if it was linked in the other Plaid environment.
- **Rate limit:** 10 per minute (shared)

### `POST /api/plaid/exchange-token`

Finishes linking. Checks for duplicates **before** exchanging the public token, so a refused link costs nothing. Then saves the connection and its accounts, responds, and runs the first sync in the background.

- **Body:**
  ```json
  {
    "public_token": "public-...",
    "institution": { "institution_id": "ins_3", "name": "Chase" },
    "accounts": [{ "id": "...", "name": "Checking", "mask": "1234", "type": "depository", "subtype": "checking" }],
    "confirmDifferentLogin": false
  }
  ```
  `institution` and `accounts` are Link's `onSuccess` metadata. `confirmDifferentLogin` is optional; send `true` after the user confirms a second login at a connected bank.
- **Returns:**
  ```json
  {
    "success": true,
    "accounts": [{ "id": "...", "name": "Plaid Checking", "accountType": "cash" }],
    "skippedDuplicateCount": 0,
    "reattachedCount": 0
  }
  ```
  `reattachedCount` counts accounts of a disconnected bank that were linked back to their old docs.
- **Errors:** 400 for a malformed token or metadata. 409, with the connection's `itemId` where there is one:
  - `duplicate_item`: every account already syncs through a connection to this bank. Use Manage accounts or Reconnect (or Restore, if the message says one is archived).
  - `duplicate_accounts`: some of them do. Almost certainly the same login.
  - `same_institution`: none do, but the bank is connected. Ask, then resend with `confirmDifferentLogin`.
  - `duplicate_item` after the exchange, if Plaid's own account list shows every account is already synced elsewhere. The new connection is removed at Plaid.
- **Rate limit:** 5 per minute
- **Max duration:** 60 seconds

### `POST /api/plaid/sync`

Syncs every bank, or one. Stops taking new pages after 40 seconds; if it stopped early, `more` is `true` and the browser calls again (`runSync` in `lib/plaidSync.ts`).

- **Body (optional):** `{ "itemId": "..." }`
- **Returns:**
  ```json
  {
    "success": true,
    "added": 12,
    "modified": 1,
    "removed": 0,
    "more": false,
    "newAccounts": [],
    "itemsNeedingReauth": [],
    "itemsFailed": [],
    "itemsInProgress": [],
    "itemsOtherEnv": []
  }
  ```
  `newAccounts` lists accounts created because the bank started sharing them. A failing bank doesn't fail the request; it's listed in one of the `items…` arrays instead.
- **Rate limit:** 10 per minute
- **Max duration:** 60 seconds

### `POST /api/plaid/refresh`

Asks Plaid to check the bank for new transactions now (`/transactions/refresh`). They arrive over the next few minutes, and the browser keeps syncing meanwhile.

- **Body (optional):** `{ "itemId": "..." }`. Without it, every bank.
- **Returns:** `{ "success": true, "refreshed": 1, "itemsNeedingReauth": [], "itemsFailed": [], "itemsOtherEnv": [] }`
- **Rate limit:** 4 per minute

### `POST /api/plaid/rebuild`

Rebuild from Plaid: the next syncs re-import the bank's full history from an empty cursor. Categories are kept.

- **Body:** `{ "itemId": "..." }`
- **Returns:** `{ "success": true }`
- **Errors:** 404 `not_found`. 409 `sync_in_progress` or `wrong_environment`.
- **Rate limit:** 2 per minute

### `GET /api/plaid/usage`

Connections created in this Plaid environment across all users, for the Connect a bank screen.

- **Returns:** `{ "env": "production", "used": 3, "limit": 10 }`. `limit` is `PLAID_ITEM_LIMIT`, or 10.
- **Rate limit:** 30 per minute

### `POST /api/plaid/disconnect-item`

Disconnects a bank. Its accounts become manual accounts with their history and last balance, and keep their Plaid details so linking the bank again reattaches them.

- **Body:** `{ "itemId": "..." }`
- **Returns:** `{ "success": true, "convertedAccounts": 2 }`
- **Errors:** 409 `sync_in_progress` if that bank is syncing right now, or `wrong_environment`.
- **Rate limit:** 10 per minute

A connection that's already gone still succeeds.

### `POST /api/accounts/delete`

Permanently deletes an archived account, its own transactions, and its balance snapshots. Never disconnects a bank.

- **Body:** `{ "accountId": "..." }`
- **Returns:** `{ "success": true, "deletedTransactions": 120 }`
- **Errors:**
  - 404 `not_found` if the account doesn't exist.
  - 409 `not_archived` if the account isn't archived.
  - 409 `still_shared` if its bank still shares it (the next sync would bring it back).
  - 409 `account_in_use` if transactions, a transfer category, or a paycheck deduction point at it. The message lists which.
- **Rate limit:** 10 per minute

## Adding a route

1. Create `app/api/<area>/<name>/route.ts`.
2. Export only `POST` (or `GET` for a read with no body), plus `maxDuration` if it can be slow, wrapped in `withUser`:

   ```ts
   import { NextResponse } from "next/server";
   import { readJsonObject, requireId, withUser } from "@/lib/api/handler";
   import { RATE_LIMITS } from "@/lib/services/rateLimit";

   export const POST = withUser({ name: "my-route", rateLimit: RATE_LIMITS.myRoute }, async ({ req, user }) => {
     const thingId = requireId(await readJsonObject(req), "thingId");
     // ...do the work under users/{user.uid}...
     return NextResponse.json({ success: true });
   });
   ```

3. Add a limit to `RATE_LIMITS` in `lib/services/rateLimit.ts`.
4. Throw `ApiError(status, code, message)` for expected failures. Let anything else throw; `withUser` turns it into a 500 and logs it safely.
5. Log with `logInfo`, `logWarn`, or `logError` from `lib/services/logging.ts`. Never log a token or a raw Plaid error.
6. Add a section to this page.
