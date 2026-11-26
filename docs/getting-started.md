# Getting started

This gets Telos running on your machine against your own Firebase project and Plaid's sandbox.

## What you need

- **Node 22** and npm.
- **A Firebase project** with Authentication and Firestore turned on.
- **A Plaid account.** The free developer account includes sandbox keys.
- **Java 21**, only if you want to run the Firestore rules tests. On a Mac: `brew install openjdk@21`.

## 1. Set up Firebase

In the [Firebase console](https://console.firebase.google.com):

1. **Create a Firestore database** (Build > Firestore Database). Any region works.
2. **Turn on Google sign-in** (Build > Authentication > Sign-in method > Google). Telos signs in with Google only.
3. **Register a web app** (Project settings > General > Your apps). Copy the config values; they go in the `NEXT_PUBLIC_FIREBASE_*` variables.
4. **Create a service account key** (Project settings > Service accounts > Generate new private key). This downloads a JSON file. It goes in `FIREBASE_SERVICE_ACCOUNT_KEY`, on one line.

To put the JSON on one line:

```bash
node -e "console.log(JSON.stringify(require('./service-account.json')))"
```

Keep the downloaded file out of the repo. Anyone with it has full access to your database.

## 2. Get Plaid keys

In the [Plaid dashboard](https://dashboard.plaid.com), go to Developers > Keys and copy your `client_id` and the **sandbox** secret.

## 3. Configure the app

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where it's used | What to put |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` and the other five `NEXT_PUBLIC_FIREBASE_*` | Browser | The web app config from step 1.3. These are public by design. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Server | The one-line service account JSON from step 1.4. |
| `PLAID_CLIENT_ID` | Server | From step 2. |
| `PLAID_SECRET` | Server | The sandbox secret from step 2. |
| `PLAID_ENV` | Server | `sandbox`. This is also the default if left blank. |
| `ENCRYPTION_KEY` | Server | A new random key: `openssl rand -base64 32`. |
| `ENCRYPTION_KEY_PREVIOUS` | Server | Leave blank. Only used while rotating keys (see [Operations](operations.md)). |
| `PLAID_REDIRECT_URI` | Server | Leave blank locally. In production, `https://<your domain>/oauth` (see [Plaid and sync](plaid-and-sync.md#oauth-banks)). |
| `PLAID_ITEM_LIMIT` | Server | Leave blank (10, Plaid's free Trial). Only for a plan with a different limit. |
| `CSP_ENFORCE` | Build | Leave blank. `true` enforces the Content Security Policy (see [Security](security.md#4-security-headers)). |

Never prefix a secret with `NEXT_PUBLIC_`. Anything with that prefix is sent to the browser.

Use a Firebase project just for development. Never point a local server at the production project.

## 4. Deploy the Firestore rules

The rules live in `firestore.rules` and must be deployed before the app will work properly.

```bash
cp .firebaserc.example .firebaserc        # or: npx firebase-tools use --add
# edit .firebaserc and put in your Firebase project id
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

## 5. Run it

```bash
npm run dev
```

Open http://localhost:3000 and sign in with Google.

## 6. Link a test bank

1. Go to **Accounts**, choose Add Account > Connect a Bank, and press **Continue to Plaid**.
2. In Plaid Link, pick any institution.
3. Sign in with one of Plaid's test users:

| Username | Password | Use it for |
|---|---|---|
| `user_good` | `pass_good` | A standard account with fixed transactions. |
| `user_transactions_dynamic` | any | Transactions that change over time, including pending to posted. Best for testing sync. |

4. The accounts appear right away, under a card for the bank. Transactions follow a few seconds later, and the card says "Importing history…" until Plaid has sent everything.
5. Try linking the same test user again: Telos refuses before exchanging anything, which is what protects your connections in production.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server. |
| `npm run build` | Production build. Needs only the public Firebase variables. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript check. |
| `npm test` | Unit tests. |
| `npm run test:rules` | Firestore rules tests on the emulator. Needs Java. |

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| "Missing or insufficient permissions" in the browser console | The rules aren't deployed, or are out of date. Redo step 4. |
| `FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON` | The JSON has line breaks or was pasted with extra quotes. Re-create it with the command in step 1. |
| `ENCRYPTION_KEY must decode to exactly 32 bytes` | The key wasn't made with `openssl rand -base64 32`. |
| Google sign-in popup closes with an error | Add your domain under Authentication > Settings > Authorized domains. `localhost` is allowed by default. |
| A Firestore error with a link to "create an index" | Follow the link, then export the index into `firestore.indexes.json` so it's kept in the repo. |

More in [Operations](operations.md).
