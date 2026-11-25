# Telos

Personal budgeting app: accounts, categories, monthly budgets, and transactions synced from banks through Plaid. Built with Next.js 16 (App Router), Firebase (Auth and Firestore), Plaid, and MUI.

See [docs/architecture.md](docs/architecture.md) for the data model, sync pipeline, encryption, and categorization.

## Setup

Requirements: Node 22, and Java 21 for the Firestore emulator (rules tests only).

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

## Environment variables

All are listed in `.env.example`. Set the same values in Vercel.

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Browser | Firebase web config. Public by design; `firestore.rules` enforces access. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Server | Admin SDK service account JSON on one line. |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Server | Plaid credentials for `PLAID_ENV`. |
| `PLAID_ENV` | Server | `sandbox` (default) or `production`. |
| `ENCRYPTION_KEY` | Server | Base64 32-byte key for Plaid access tokens: `openssl rand -base64 32`. |
| `ENCRYPTION_KEY_PREVIOUS` | Server | Optional. The old key during a rotation. |

`next build` needs no server secrets; server clients are created on first use.

## Firestore rules

The rules live in `firestore.rules` and are deployed from the repo:

```bash
firebase use --add                      # once, picks the Firebase project
npx firebase-tools deploy --only firestore:rules
```

Deploy the rules whenever `firestore.rules` changes. Indexes are in `firestore.indexes.json` (`--only firestore:indexes`).

## Plaid sandbox

`PLAID_ENV=sandbox` uses Plaid's test banks. In Plaid Link, pick any institution and sign in with:

- `user_good` / `pass_good`: a standard account with static transactions.
- `user_transactions_dynamic` / any password: transactions that change over time, including pending to posted. Use this to test sync.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm test` | Unit tests (Vitest). |
| `npm run test:rules` | Firestore rules tests on the emulator. Needs Java. |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, rules tests, and a build on every push to `main` and `production-hardening`, and on pull requests.

## License

See [LICENSE](LICENSE).
