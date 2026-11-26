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

### `POST /api/plaid/create-link-token`

Starts linking a new bank.

- **Body:** none
- **Returns:** `{ "linkToken": "link-sandbox-..." }`
- **Rate limit:** 10 per minute (shared with the update-mode route)

### `POST /api/plaid/create-update-link-token`

Starts reconnecting a bank that needs the user to sign in again.

- **Body:** `{ "itemId": "..." }`
- **Returns:** `{ "linkToken": "..." }`
- **Errors:** 404 if the connection doesn't exist
- **Rate limit:** 10 per minute (shared)

### `POST /api/plaid/exchange-token`

Finishes linking. Saves the connection and its new accounts, responds, then runs the first sync in the background.

- **Body:** `{ "public_token": "public-..." }`
- **Returns:**
  ```json
  {
    "success": true,
    "accounts": [{ "id": "...", "name": "Plaid Checking", "accountType": "cash" }],
    "skippedDuplicateCount": 0
  }
  ```
- **Errors:** 400 if the token doesn't start with `public-`. 409 `duplicate_accounts` if every account is already in Telos (the message says whether to restore an archived one).
- **Rate limit:** 5 per minute
- **Max duration:** 60 seconds

### `POST /api/plaid/sync`

Syncs every bank for the user.

- **Body:** none
- **Returns:**
  ```json
  {
    "success": true,
    "added": 12,
    "modified": 1,
    "removed": 0,
    "itemsNeedingReauth": [],
    "itemsFailed": [],
    "itemsInProgress": []
  }
  ```
  A failing bank doesn't fail the request; it's listed in one of the three arrays instead.
- **Rate limit:** 6 per minute
- **Max duration:** 60 seconds

### `POST /api/plaid/disconnect-item`

Disconnects a bank. Its accounts become manual accounts with their history and last balance.

- **Body:** `{ "itemId": "..." }`
- **Returns:** `{ "success": true, "convertedAccounts": 2 }`
- **Errors:** 409 `sync_in_progress` if that bank is syncing right now.
- **Rate limit:** 10 per minute

A connection that's already gone still succeeds.

### `POST /api/accounts/delete`

Permanently deletes an archived account and its own transactions.

- **Body:** `{ "accountId": "..." }`
- **Returns:** `{ "success": true, "deletedTransactions": 120 }`
- **Errors:**
  - 404 `not_found` if the account doesn't exist.
  - 409 `not_archived` if the account isn't archived.
  - 409 `account_in_use` if transactions, a transfer category, or a paycheck deduction point at it. The message lists which.
  - 409 `sync_in_progress` if the account's bank is syncing right now.
- **Rate limit:** 10 per minute

## Adding a route

1. Create `app/api/<area>/<name>/route.ts`.
2. Export only `POST` (plus `maxDuration` if it can be slow), wrapped in `withUser`:

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
