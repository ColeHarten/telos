# Telos App Review (v2)

## 1. Current State

Telos is a Next.js 16 (App Router) budgeting app backed by Firebase (Firestore + Auth) and Plaid, styled with MUI. Pages talk to Firestore **directly from the client** via `lib/firebaseClient.ts`, through hooks scoped under `users/{uid}/...`: `useAccounts`, `useCategories`, `useBudget`, `useTransactions`, `useAutomations`. Server-only work (Plaid calls, access-token encryption, admin Firestore) lives in `app/api/plaid/*`, gated by `lib/services/auth.ts`'s `requireUser`.

Since the last pass, several real fixes landed: `useAuth()`'s `authLoading` is now wired correctly into the Settings page, the disabled currency/budget-month selects were pulled (replaced with a placeholder — see 4.2), the stray `console.log` in `create-link-token` is gone, the dead `getCashflowName` helper was removed from the Transactions page, and the Automations page no longer has a disabled "New Automation" button (that whole flow moved into the transaction-assignment prompt). Good progress.

This pass went deeper into concurrency, referential integrity between Firestore documents, and a couple of things that only show up under real failure conditions (a bad env var, a flaky network request, a second open tab). Those are the meatiest findings below.

---

## 2. Major Bugs

### 2.1 "Connect a Bank" / "Reconnect" can get permanently stuck after a single failed request
`lib/hooks/usePlaidAccountLink.ts`:
```js
const isFetching = useRef(false);
...
useEffect(() => {
    if (isFetching.current || token) return;
    isFetching.current = true;
    const fetchPromise = isUpdateMode ? ... : ...;
    fetchPromise
      .then((res) => res.json())
      .then((data) => {
        if (data.linkToken) setToken(data.linkToken);
      })
      .catch((error) => { ...onLinkError?.(...) });
}, [...]);
```
Two compounding problems:
- `res.ok` is never checked. If `/api/plaid/create-link-token` (or the update-mode variant) responds with a non-2xx status — which it will on *any* server-side failure, since both routes `catch` internally and return `{ error: ... }` with a 401/500 — `res.json()` still resolves fine, `data.linkToken` is just `undefined`, and the `.then` chain finishes "successfully." No error is ever surfaced (`onLinkError` isn't called on this path).
- `isFetching.current` is set to `true` and is **never reset**, in either the success or failure path.

Net effect: one transient failure (expired token mid-request, a Plaid outage, a 500) leaves the button permanently reading "Loading..." with no error message and no retry — the guard `if (isFetching.current || token) return;` blocks every future attempt until the user does a full page reload. This affects both the initial "Connect a Bank" flow and the per-row "Reconnect" flow for items needing reauth.

### 2.2 Pending → posted Plaid transactions lose manual categorization
`lib/services/syncService.ts` processes `added`/`modified`/`removed` from `transactions/sync` but never reads or stores `pending_transaction_id`. When a pending transaction posts, Plaid's sync API typically emits a `removed` event for the pending transaction and an `added` event for a **new transaction with a different `transaction_id`**, linked back via `pending_transaction_id` specifically so apps can carry categorization forward. Since this field is dropped entirely, the posted transaction is written as a brand-new document and run through `applyRules` from scratch:
- If an automation exists for the merchant, it'll reassign correctly.
- If the user only manually corrected the *pending* transaction (common — pending transactions often show a cryptic authorization string, so people fix it once it posts with a real merchant name), that correction is silently lost and the posted version comes back as "Needs Review" again.

### 2.3 Archiving bypasses every referential-integrity check that deletion enforces
`archiveAccount` (`lib/hooks/useAccounts.ts`) and `archiveCategory` (`lib/hooks/useCategories.ts`) are both unconditional `updateDoc({ isArchived: true })` calls — unlike `deleteAccount`, which requires `checkAccountIsolation` to pass first. Two concrete failure modes:

- **Accounts:** Archiving an account that's still a paycheck-deduction destination (or a transfer category's `transferAccountId`) doesn't clear or warn about either reference. The account disappears from `activeAccounts`/`contributionEligibleAccounts`, so `AddCategoryModal`'s Autocomplete for that deduction row silently renders blank (the linked account still exists in Firestore, it's just filtered out of the option list) — but the underlying `linkedAccountId` is untouched, and `reconcileContributionTransfers` will keep happily writing contribution amounts toward an account the user can no longer see anywhere in the UI.
- **Categories:** Archiving an *income* category orphans any auto-created transfer categories linked to it (`sourceIncomeCategoryId`). The Categories page's grouping logic (`app/(authenticated)/categories/page.tsx`) only renders a dependent transfer row underneath an income row that's in the currently-visible `incomeParents` list — once the parent is archived, it drops out of `incomeParents`, and the child transfer category (still active, still categorizing real transactions) is filtered into neither the "other" bucket (it's explicitly excluded via `isDependentTransferCategory`) nor shown under its now-hidden parent. It becomes permanently invisible in both the Active and Archived tabs, with no UI path to find it, edit it, or unlink it — short of restoring the parent income category first.

### 2.4 Archived categories stay assignable and then silently vanish from every report
`useCategories.ts` returns *all* categories, archived or not, and nothing downstream filters them out of the places that matter:
- The Transactions page's category-assignment `<Select>` (`app/(authenticated)/transactions/page.tsx`) maps over the raw `categories` array — archived categories are fully selectable for new/re-categorized transactions.
- `lib/services/ruleEngine.ts`'s `applyRules` never checks `category.isArchived` either, so an old automation will happily keep auto-assigning newly-synced transactions to a category the user archived months ago.
- But `app/(authenticated)/budgets/page.tsx` and `app/(authenticated)/dashboard/page.tsx` both build their "actual" totals from `activeCategories`-derived id lists (`incomeCategories`, `expenseCategories`, `expenseCategoryIds`), while the map that aggregates actual dollars per category (`actualByCategoryId`) is keyed off the *unfiltered* `categories`/`categoriesById`. Money assigned to an archived category gets computed into that map and then simply never read, because nothing iterates archived categories when rendering the budget groups or the dashboard hero totals.

Net effect: a transaction can be actively assigned to an archived category (by a user, or automatically by a stale automation) and its dollar amount disappears from Budgets and Dashboard entirely — no warning, no "unaccounted" bucket, nothing. It still shows correctly in the raw Transactions list, which makes the discrepancy hard to notice.

### 2.5 Concurrent tabs/devices can silently clobber an in-progress budget edit
`lib/hooks/useBudget.ts` keeps `budgetLinesRef.current` as the source of truth for the debounced autosave, but the live `onSnapshot` listener on the budget doc unconditionally overwrites it on every remote change:
```js
const unsubscribe = onSnapshot(ref, (snapshot) => {
  ...
  setBudgetValues(next);
  setBudgetLines(lines);
  budgetLinesRef.current = lines;   // <- no check for a pending local edit
});
```
If a user has the app open on two tabs/devices (or even just two browser tabs) and types into a budget field on Tab A, a save landing from Tab B before Tab A's 800ms debounce fires will overwrite `budgetLinesRef.current` with Tab B's snapshot. When Tab A's debounce then fires, `flushSave()` writes back the *overwritten* (Tab B's) data — Tab A's in-progress edit is discarded without any indication to the user, and the UI visibly snaps back to the old value moments after they typed something.

---

## 3. Security

### 3.1 A malformed `FIREBASE_SERVICE_ACCOUNT_KEY` logs the full raw key, including the private key
`lib/firebaseAdmin.ts`:
```js
try {
  serviceAccount = JSON.parse(rawKey);
} catch (err) {
  console.error("[Firebase Admin] Raw env value:", rawKey);
  throw new Error("[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
}
```
This is a real risk, not just a theoretical one — the most common way this env var breaks is exactly a JSON-parse failure, because the key's `private_key` field contains literal `\n` sequences that frequently get mangled when pasted into a hosting provider's env var UI or CI secret store. Whenever that happens, this line dumps the entire service-account JSON — private key and all — into whatever log aggregation the deployment uses. **Remove the raw-value log**, or at minimum redact it before logging.

### 3.2 Several "UI-only" invariants have no enforcement below the Firestore SDK
A few fields are treated as privileged/system-managed purely by convention in the client code — `Category.sourceIncomeCategoryId` / `sourceDeductionId` (comment: *"never set from the manual category form"*), `Category.isDefault`, `Deduction.type` for tax rows never carrying a `linkedAccountId`. Since every write goes straight from the browser through the Firestore client SDK, none of these are actually enforced anywhere in application code — the only thing standing between a modified/malicious client and, say, spoofing `sourceDeductionId` on an arbitrary category (which flips it into the "system-managed, can't be edited or archived" UI state) is whatever Firestore Security Rules exist. No `firestore.rules` file is present in this repository, so this can't be verified from the codebase alone — worth confirming those rules actually validate field-level invariants and not just `users/{uid}` path scoping (see 3.4 in the previous pass, still open).

### 3.3 No rate limiting on Plaid-calling routes
`/api/plaid/sync`, `/api/plaid/create-link-token`, `/api/plaid/create-update-link-token`, and `/api/plaid/exchange-token` are all callable as fast as a valid ID token can be attached to a request, with no throttling. Plaid bills per API call for some products, and `transactionsSync`'s retry loop in `plaidService.ts` alone can issue up to 5 calls per invocation — a compromised token or a buggy client-side retry loop could run up real cost. Worth adding basic per-user rate limiting, at least on `/sync`.

---

## 4. Minor Fixes

### 4.1 Duplicate-account-name check includes archived accounts
`app/(authenticated)/accounts/page.tsx`'s `handleSaveAccountForm` checks the new/renamed name against `accounts` (all accounts, active *and* archived) rather than just `activeAccounts`. A very normal flow — rename an account, archive the old one, later add a new account with the old name — is blocked indefinitely because the archived duplicate still "owns" that name.

### 4.2 Settings page's Preferences card is now a dead-end placeholder
`app/(authenticated)/settings/page.tsx` renders a literal `<Typography variant="h5">TBU</Typography>` once loaded. This fixes the old "looks interactive but isn't" bug by removing the interactivity entirely, but it's still user-visible ship-worthy content reading "TBU" — worth hiding the whole card (or replacing with a short "Coming soon" line) until the feature exists. Also note `DefaultBudgetMonth` is still imported in this file but never referenced — dead import.

### 4.3 Auto-created transfer category names go stale forever, with no way to fix them
`reconcileContributionTransfers` (`lib/hooks/useCategories.ts`) only updates `estimatedMonthly` and `transferAccountId` on an existing linked transfer category — never `name`. So renaming a paycheck deduction's label (e.g., "401k Contribution" → "401(k) — Vanguard") never propagates to the transfer category that was named from it at creation time. Compounding this, the Categories page's row menu explicitly disables Edit for these dependent transfer rows (`isDependentTransferCategory` → shows a disabled "Managed by income category" item instead), so there's currently **no path at all**, UI or automatic, to correct a stale name once it's set.

### 4.4 `exchange-token`'s duplicate-account dedup has two real gaps
`app/api/plaid/exchange-token/route.ts` dedupes new Plaid-linked accounts against existing ones by `(institutionId, mask)`, built only from accounts where `!data.isArchived`. Two consequences:
- Institutions/account types that don't return a `mask` (some investment accounts, some smaller institutions) are *never* treated as duplicates — comment even says so explicitly — so relinking the same account repeatedly creates unlimited duplicates.
- Because the dedup set excludes archived accounts, re-linking a bank you previously archived (instead of using the existing "Restore" action) creates a brand-new duplicate Account doc rather than erroring or nudging the user toward restoring the old one.

### 4.5 Selected-account filter can silently keep filtering by an account no longer shown as selected
`app/(authenticated)/transactions/page.tsx`: `selectedAccount` is derived by looking `selectedAccountId` up in `selectableAccounts` (active accounts only). If the currently-filtered account gets archived elsewhere, `selectedAccount` becomes `undefined` and the filter button relabels itself "All Accounts" — but `scopedTransactions` still filters by the raw (stale) `selectedAccountId`, which wasn't cleared. The button visually claims "All Accounts" while the table quietly keeps showing just the one (now-archived) account's transactions.

### 4.6 `tsconfig.json`'s stray include entry is still unfixed
```json
"include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
, "app/api/plaid/create-link-token"  ],
```
Still present, still redundant (already covered by the `**/*.ts`/`**/*.tsx` globs), still formatted like a paste accident. Low priority, but worth a quick cleanup so it doesn't get copied forward the next time this file is touched.

### 4.7 Dashboard's net worth calc doesn't fall back to `startingBalance`
`app/(authenticated)/dashboard/page.tsx`'s `netWorth` memo uses `account.currentBalance ?? 0`, while `app/(authenticated)/accounts/page.tsx`'s `accountSummary` uses `account.currentBalance ?? account.startingBalance ?? 0`. In the current writers (`addManualAccount`, `exchange-token`) both fields always get set together, so this is latent rather than active — but if a doc ever ends up with `currentBalance` unset (manual Firestore edit, future migration, partial write), the Dashboard will silently undercount that account by treating it as $0 instead of falling back like the Accounts page does.

---

## 5. UI/UX Suggestions

### 5.1 "Last Synced" card doesn't reflect an in-progress sync
Still true from the prior pass — while `syncing` is `true` on the Transactions page, the "Last Synced" card just shows the old timestamp with no in-progress indicator beyond the button's own spinner.

### 5.2 Bracket-style negative balances
Carried over as a feature request: add a preference to render negative balances as `(1,234.00)` instead of `-1,234.00`. Not implemented anywhere in `formatCurrency`/`formatMoney` yet.

---

## 6. Future Work

1. **Make transaction reads live and bounded.** `useTransactions.ts` still does a one-shot `getDocs` over the *entire* transaction history rather than a live, paginated `onSnapshot`. Combine with the pending→posted issue above — a bounded, live query would also make it easier to reconcile pending/posted pairs correctly.
2. **Batch `reconcileContributionTransfers` into a single write.** Still a sequence of individual `addCategory`/`updateCategory`/`deleteCategory` calls; a partial failure mid-loop leaves paycheck-linked transfer categories inconsistent. Wrap in a `writeBatch()`.
3. **De-duplicate cross-page business logic.** `isInMonth`, `getCurrentMonthKey`, budget-value parsing, and actual-vs-planned aggregation are still separately re-implemented in `dashboard/page.tsx`, `budgets/page.tsx`, and `useBudget.ts` — pull into a shared `lib/budgetCalculations.ts`.
4. **Add a real sync-status trail**, not just the point-in-time "Last Synced" timestamp and a final snackbar.
5. **Write developer documentation** — still just the default `create-next-app` README. No architecture overview, no Firestore data-model description, no notes on the encryption scheme, the categorization pipeline, or the Plaid Link/update-mode flow.
6. **Plaid OAuth / webhook gaps.** `createLinkToken` doesn't pass a `redirect_uri`, which many larger institutions (Chase, BofA, etc.) require for their OAuth-based Link flow — those institutions will fail to link in production even though they work fine in Sandbox. There's also no `/api/plaid/webhook` route, so transaction data only ever refreshes on an explicit user-triggered sync; it'll silently go stale between visits.
7. **Dashboard cash-flow recompute cost.** `cashFlowTrend` still loops the full `transactions` array once per displayed month (×6) on every render where `monthKey`/`transactions` changes — fine today, but worth precomputing once data volume grows, especially once #1 above makes the underlying list larger and live.