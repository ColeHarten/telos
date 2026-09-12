# Telos App Review (Revised)

## 1. Current State

Telos is a Next.js 16 (App Router) budgeting app backed by Firebase (Firestore + Auth) and Plaid, styled with MUI. Pages talk to Firestore **directly from the client** via `lib/firebaseClient.ts`, through hooks scoped under `users/{uid}/...`: `useAccounts`, `useCategories`, `useBudget`, `useTransactions`, `useAutomations`. Server-only work (Plaid calls, access-token encryption, admin Firestore) lives in `app/api/plaid/*`, gated by `lib/services/auth.ts`'s `requireUser`.

Per the footer in `app/(authenticated)/layout.tsx`, the app is mid-build ("Phase 3: Automations and clean up"). The transfer-account-ID bug that was the biggest correctness issue in the last pass has been fixed cleanly — transactions now carry a proper `transferAccountId`, resolved once in `ruleEngine.ts` and reused consistently by the isolation check and the budgets aggregation.

---

## 2. Major Bugs

### 2.1 Settings page: preferences are permanently non-interactive, and loading state is wrong
`app/(authenticated)/settings/page.tsx` still has both issues from before:
```js
const { user } = useAuth();
const { settings, updateSettings, ensureUserProfile } = useBudget(user, false);
```
`authLoading` is hardcoded to `false` rather than read from `useAuth()`, so `useBudget`'s internal effects believe auth has already resolved even while it's still loading — causing a spurious "no settings" flash on load.

Both dropdowns are also still hardcoded off:
```jsx
<Select label="Currency" value={currency} disabled={true} onChange={...}>
<Select label="Default budget month" value={defaultMonth} disabled={true} onChange={...}>
```
The save path (`handleCurrencyChange` → `updateSettings`) works end-to-end, but the UI can never trigger it. **Fix**: pass real `authLoading`; replace `disabled={true}` with `disabled={isSavingSettings}` (or hide the controls entirely — see UI/UX section below — if the feature isn't meant to ship yet).

---

## 3. Minor Fixes

### 3.1 Dead code left in `transactions/page.tsx`
`getCashflowName` is defined but never called. Remove it, or wire it in if it was meant to label something in the row detail.

### 3.2 Stray debug log in a server route
`app/api/plaid/create-link-token/route.ts`:
```js
console.log("Creating link token");
```
Harmless but noisy in production logs — remove or gate behind a debug flag.

### 3.3 Malformed/stray `tsconfig.json` include entry
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
`app/api/plaid/create-link-token` is redundant (already covered by `**/*.ts`/`**/*.tsx`) and the formatting suggests it was pasted in accidentally. Clean up to avoid confusing future edits to this file.

### 3.4 No field/type validation at the Firestore rules layer
Carried over from the last review: rules correctly scope *who* can read/write (`users/{uid}/...`), but nothing stops a client from writing an invalid `kind`, `categoryKind`, or similarly-typed enum field directly. Not a data-exposure risk, but worth tightening (e.g., with `request.resource.data.kind in ['income','expense','transfer']`-style checks) before this becomes a real data-integrity bug.

### 3.5 Dashboard recomputes 6 months of cash-flow from the full transaction list on every render
`cashFlowTrend` in `dashboard/page.tsx` loops over the entire `transactions` array once per month (×6) every time `monthKey` or `transactions` changes. Fine at current data volumes, but combined with `useTransactions`' unbounded one-shot fetch (see Future Work), this will get slower as a user's history grows. Consider precomputing monthly totals once, or scoping the loop to just the needed date range.

---

## 4. UI/UX Suggestions

### 4.1 Settings selects look interactive but aren't
Beyond the functional bug in 2.1, the visual design compounds it: both `Select` components render with full chevrons and hover affordances despite being permanently disabled, which reads as broken rather than "not yet available." Either finish the feature (see 2.1) or swap in a plain read-only display (e.g., a `Typography` row) until it's ready.

### 4.2 Disabled "New Automation" button relies on hover-only tooltip
`app/(authenticated)/automations/page.tsx` explains why the button is disabled purely via a `Tooltip`, which isn't discoverable on touch devices and is easy to miss via keyboard navigation. Consider an inline helper line near the button, in addition to (or instead of) the tooltip.

### 4.3 "Last Synced" card doesn't reflect an in-progress sync
Now that this card shows real data (fixed from the last review), it still just freezes on the old timestamp while `syncing` is `true` on the Transactions page. A small "Syncing…" state on the card itself (not just the button spinner) would make the in-progress state clearer.

---

## 5. Future Work

1. **Make transaction reads live and bounded.** `useTransactions.ts` still fetches the *entire* transaction history with a one-shot `getDocs`, not `onSnapshot`. Switch to a live listener and add a bounded query (e.g., last N months, paginated) so other tabs/devices stay in sync and cost/latency don't grow unbounded with account age.

2. **Batch multi-document writes for atomicity.** `useCategories.ts`'s `reconcileContributionTransfers` still issues a sequence of individual `addCategory`/`updateCategory`/`deleteCategory` calls in a loop; a partial failure leaves paycheck-linked transfer categories inconsistent. Wrap these in a single Firestore `writeBatch()`/transaction.

3. **De-duplicate cross-page business logic.** `isInMonth`, `getCurrentMonthKey`, budget-value parsing, and actual-vs-planned aggregation are still separately re-implemented in `dashboard/page.tsx`, `budgets/page.tsx`, and `useBudget.ts`. Pull this into a shared `lib/budgetCalculations.ts` so fixes like the transfer-account-ID one don't need to be applied in multiple places by hand.

4. **Add a real sync-status trail.** Beyond the point-in-time "Last Synced" display, persist sync history (counts added/modified/removed, timestamp, any `itemsNeedingReauth`) so users have visibility into what changed on their last sync, not just the final summary snackbar.

5. **Write developer documentation.** There's currently no documentation beyond the default `create-next-app` README — no architecture overview, no description of the Firestore data model (`users/{uid}/accounts|categories|budgets|transactions|automations|plaidItems`), no explanation of the categorization pipeline (automations → learned Plaid-category defaults → "Needs Review"), and no notes on the Plaid Link/update-mode flow or the encryption scheme for access tokens. As the app grows past "Phase 3," this becomes the biggest onboarding cost for anyone besides the original author — worth a `docs/` folder covering data model, auth flow, and the sync/categorization pipeline at minimum.