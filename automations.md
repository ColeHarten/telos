# Telos Automations & Auto-Categorization: How It Works, and How to Improve It

## 1. Overview

Telos categorizes incoming transactions through a two-tier rule engine that runs during every Plaid sync. The goal is to minimize how often a user has to manually categorize a transaction, by learning from what they've already told the app.

| Tier | Mechanism | Trigger | Confidence |
|------|-----------|---------|------------|
| 1 | **Automations** — explicit merchant → category rules | User opts in via a prompt after manually categorizing a transaction | Absolute — always wins if present |
| 2 | **Learned Plaid-category defaults** — statistical mapping from Plaid's `detailed` category code to a category | Accrues automatically from every manual correction | Probabilistic — requires a minimum sample size and margin |
| — | **Needs Review** | Neither tier matches | N/A |

Both tiers are evaluated **server-side**, once per transaction, during `syncPlaidItem` (`lib/services/syncService.ts`), via `applyRules()` in `lib/services/ruleEngine.ts`. Nothing about categorization happens client-side except the *initial signal* (the user's manual pick) and the *opt-in* to create a Tier 1 rule.

---

## 2. Data model

### `users/{uid}/automations/{merchantKey}`
```ts
{
  merchantKey: string;     // normalized merchant string, also the doc id
  merchantLabel: string;   // original, un-normalized text — display only
  categoryId: string;
  createdAt: Timestamp;
}
```
Using the normalized key as the document ID is a deliberate 1:1 constraint: at most one automation per merchant. Creating a new automation for an already-automated merchant overwrites the old rule rather than creating a duplicate.

### `users/{uid}/categoryPlaidStats/{plaidDetailedCode}`
```ts
{
  counts: Record<categoryId, number>; // vote tally per category for this Plaid code
  updatedAt: Timestamp;
}
```
One document per Plaid `personal_finance_category.detailed` code the user has ever manually corrected. `counts` is a running tally of which category that code has been corrected to, and how many times.

### Relevant `Transaction` fields (`lib/types/types.ts`)
```ts
category: PlaidTransaction["personal_finance_category"] | null; // Plaid's own classification
categoryKind: CategoryKind | null;   // "income" | "expense" | "transfer" | null (unassigned)
categoryId: string | null;
transferAccountId: string | null;    // only meaningful when categoryKind === "transfer"
```

---

## 3. The normalization layer (`lib/merchant.ts`)

```ts
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
```
This is the single point of truth for turning a merchant string into a stable key, and it is imported by **both** sides of Tier 1:
- Client-side, in `useAutomations.ts`'s `createAutomation`, when a user turns a manual categorization into a rule.
- Server-side, in `ruleEngine.ts`'s `applyRules`, when scoring an incoming Plaid transaction.

Both sides derive the merchant string identically — `merchantName ?? rawName` — so as long as `normalizeMerchant` itself doesn't change behavior between calls, keys line up reliably. This consistency is the entire reason Tier 1 matching works at all; if the two call sites ever normalized differently, automations would silently stop matching with no error surfaced anywhere.

---

## 4. Tier 1 — Automations, in detail

### Creating a rule
1. User manually categorizes a transaction on the Transactions page (`handleCategoryChange` in `app/(authenticated)/transactions/page.tsx`).
2. `updateTransactionAssignment` persists that single categorization.
3. `AutomationPromptDialog` opens: *"Assign every future transaction from **[merchant]** to **[category]** automatically?"*
4. On confirm, `createAutomation(tx.displayName, categoryId)` runs (`useAutomations.ts`):
   - Normalizes `tx.displayName` → `merchantKey`.
   - Writes/overwrites `users/{uid}/automations/{merchantKey}`.
   - Optimistically updates local state (`setAutomations`), so the Automations page reflects it immediately without waiting on a refetch.

### Applying a rule
In `applyRules()`:
```ts
const merchantKey = normalizeMerchant(transaction.merchantName ?? transaction.rawName);
const automatedCategoryId = context.automations.get(merchantKey);
if (automatedCategoryId) {
  const automatedCategory = context.categories.find(c => c.id === automatedCategoryId);
  if (automatedCategory) {
    return { ...transaction, categoryKind: automatedCategory.kind, categoryId: automatedCategory.id,
             transferAccountId: resolveTransferAccountId(automatedCategory) };
  }
  // category was deleted since the automation was created — fall through to Tier 2
}
```
Automations are checked **first**, unconditionally, for every newly-added transaction in a sync run. If the automation exists but points at a category that's since been deleted, it silently falls through rather than erroring.

### Managing rules
`app/(authenticated)/automations/page.tsx` lists all automations live, resolves each `categoryId` to a name/kind/color for display, supports search by merchant or category name, and supports deletion (optimistic, reverts on failure). There is currently no UI to *edit* an automation's target category — only delete-and-recreate.

---

## 5. Tier 2 — Learned Plaid-category defaults, in detail

### Recording a signal
Every manual categorization goes through `updateTransactionAssignment` (`lib/hooks/useTransactions.ts`), which after a successful write checks:
```ts
const isRealAssignment = Boolean(categoryKind) && Boolean(categoryId);
const isActuallyDifferent = target.categoryKind !== categoryKind || target.categoryId !== categoryId;

if (isRealAssignment && isActuallyDifferent && target.plaidCategoryDetailed) {
  recordCategorySignal(target.plaidCategoryDetailed, categoryId!);
}
```
Three conditions must all hold before a vote is recorded:
1. It's a real assignment (not clearing a category).
2. It's actually a change from what was there before (prevents re-saving the same value from inflating the count).
3. The transaction has a Plaid `detailed` code to attribute the vote to.

`recordCategorySignal` does an atomic increment:
```ts
await setDoc(statsRef, { [`counts.${categoryId}`]: increment(1), updatedAt: serverTimestamp() }, { merge: true });
```
This is fire-and-forget — errors are logged but never surfaced to the user or rolled back, since a failed learning-signal write shouldn't block or undo the actual categorization the user just performed.

### Resolving a winner
Once per sync run, `buildRulesContext()` (`ruleEngine.ts`) loads every `categoryPlaidStats` doc and calls `resolveWinner(counts)`:
```ts
const MIN_SAMPLES = 3;  // top category needs at least this many corrections
const MIN_MARGIN = 2;   // and must lead the runner-up by at least this many

function resolveWinner(counts: Record<string, number>): string | null {
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const [topId, topCount] = ranked[0];
  const runnerUpCount = ranked[1]?.[1] ?? 0;
  if (topCount < MIN_SAMPLES) return null;
  if (topCount - runnerUpCount < MIN_MARGIN) return null;
  return topId;
}
```
This is a pure function (no I/O), so it's cheap to run for every stats doc on every sync, and easy to unit test in isolation.

### Applying the default
In `applyRules()`, only reached if Tier 1 didn't match:
```ts
const detailedCode = transaction.category?.detailed;
if (detailedCode) {
  const learnedCategoryId = context.plaidCategoryDefaults.get(detailedCode);
  if (learnedCategoryId) {
    const learnedCategory = context.categories.find(c => c.id === learnedCategoryId);
    if (learnedCategory) {
      return { ...transaction, categoryKind: learnedCategory.kind, categoryId: learnedCategory.id,
               transferAccountId: resolveTransferAccountId(learnedCategory) };
    }
  }
}
```
Same "category might have been deleted" fallthrough behavior as Tier 1.

---

## 6. Confirmed: does Tier 2 currently work?

**Yes, mechanically.** Corrections accumulate as votes, `resolveWinner` correctly enforces a minimum sample size and margin before trusting a signal, and `applyRules` correctly applies the winner to new transactions going forward, falling back to "Needs Review" when nothing matches.

**But it has real, practical limitations:**

1. **Cold start.** A Plaid `detailed` code needs 3+ corrections, with a clear margin, before Tier 2 does anything for it. For a new user, everything routes to "Needs Review" until enough manual corrections accumulate — there's no seeding from Plaid's own top-level category name as an interim heuristic.

2. **Only evaluated for newly-added transactions.** `syncPlaidItem` only calls `applyRules` on `data.added`. Transactions in `data.modified` only get `amount`/`rawName`/`pending`/`updatedAt` merged — categorization fields are deliberately left untouched (so a Plaid edit can never clobber a user's manual assignment). But this means a transaction that starts as `pending` with a vague or missing `detailed` code, then gets reclassified by Plaid once it posts, never gets a second chance at Tier 2 — it's stuck at whatever it got (or didn't get) at creation time.

3. **Votes never decay or get corrected.** If a user's categorization habits shift over time (e.g., they start splitting a merchant across two categories, or they miscategorized early on and only later notice), old votes for the "wrong" category remain in the tally forever. There's no decay, no cap, and no way to invalidate a specific past vote.

4. **Silent stale-category fallthrough.** If the winning `categoryId` for a code has since been deleted, `applyRules` falls through to "Needs Review" for every transaction with that code — it doesn't consider the second-place category, and it doesn't reset/prune the stats doc. The dead category keeps "winning" internally (and losing at apply-time) until enough *new* corrections push a different category past the threshold.

5. **No per-user visibility.** There is no UI anywhere that shows a user which Plaid codes have a learned default, what that default currently is, or how confident it is. It's entirely invisible — a transaction either gets auto-categorized or it doesn't, with no explanation of why.

---

## 7. How to improve it

Ordered roughly by impact-to-effort ratio.

### 7.1 Re-run Tier 2 on modified transactions too
**Problem:** #2 above. **Fix:** when processing `filteredModified`, only skip re-running `applyRules` if the transaction is *already categorized*. If `categoryKind`/`categoryId` are still `null` (i.e., it fell to "Needs Review" at creation), it's safe to re-run the full rules pipeline on the update — there's no user assignment to protect yet. This requires reading the existing doc's current categorization state before deciding whether to merge or re-run rules, which is a modest change to `syncPlaidItem`.

### 7.2 Seed Tier 2 with a Plaid-primary fallback before any corrections exist
**Problem:** #1, cold start. **Fix:** maintain a small static lookup table (Plaid `primary` category → a sensible default `CategoryKind`, e.g. `FOOD_AND_DRINK` → expense, `TRANSFER_IN`/`INCOME` → income) as a **Tier 3**, checked only when Tier 1 and Tier 2 both miss. This wouldn't assign a specific user `Category`, but could at least default `categoryKind` correctly (or, if the user has exactly one active category of the implied kind, assign that). This reduces "Needs Review" pile-up for new users without touching the learned-default logic at all.

### 7.3 Prune stale votes when a category is deleted
**Problem:** #4. **Fix:** in `useCategories.ts`'s `archiveCategory`/`deleteCategory`, do a best-effort sweep of `categoryPlaidStats` docs and remove any `counts.{deletedCategoryId}` entries (a `FieldValue.delete()` on that map key). This is cheap relative to how often categories are deleted, and prevents zombie categories from silently suppressing Tier 2 for their codes indefinitely.

### 7.4 Add vote decay or a rolling window
**Problem:** #3. **Fix options, roughly in order of implementation cost:**
- **Cheapest:** cap the total votes per code (e.g., once `sum(counts) > 20`, halve all counts, rounding down) — keeps recent behavior more influential without needing per-vote timestamps.
- **More precise:** store individual correction events (`categoryPlaidStats/{code}/corrections/{txId}`: `{ categoryId, correctedAt }`) instead of a running tally, and compute `resolveWinner` over only the last N corrections or last N months. More Firestore reads at sync time, but much more accurate and auditable.

### 7.5 Surface learned defaults in the UI
**Problem:** #5. **Fix:** add a small section to the Automations page (or a new "Learned Categories" tab) listing each Plaid `detailed` code with an active default: the resolved category, the vote count, and a "this isn't right" action that either deletes the stats doc (resetting learning for that code) or lets the user promote it into an explicit Tier 1 automation keyed on the Plaid code rather than merchant name. This closes the trust gap — right now users have no way to know *why* a transaction was auto-categorized the way it was.

### 7.6 Let a user "pin" a Tier 2 default as a permanent rule
**Related to 7.5.** Once a learned default has been active and correct for a while, offer a one-click "make this permanent" that removes the corresponding `categoryPlaidStats` entry's ongoing influence (so it can't drift) and instead creates a durable rule. This would require extending the automation data model to support a `plaidDetailedCode` key in addition to (or instead of) `merchantKey`, since not every transaction has a stable merchant string but every transaction has a Plaid category code.

### 7.7 Make automation editing possible without delete-and-recreate
**Smaller UX fix, not core logic.** Add an "Edit" option to the Automations page's row menu that opens a category picker and calls `createAutomation` again with the new `categoryId` (which already overwrites cleanly, since the doc ID is the merchant key) — no backend change needed, just a UI affordance that isn't wired up yet.

### 7.8 Add tests around `resolveWinner` and `normalizeMerchant`
Both are already pure functions with no I/O, explicitly noted in `ruleEngine.ts`'s comments as being "easy to unit test independent of Firestore." Neither currently appears to have tests. Given how much silent-failure risk lives in these two functions specifically (a normalization drift or an off-by-one in the threshold logic would fail silently, with no error surfaced anywhere), they're the highest-value place in this system to add unit test coverage.

---

## 8. Summary table

| Improvement | Addresses | Relative effort |
|---|---|---|
| Re-run rules on modified transactions still in "Needs Review" | Cold-start persistence for pending → posted transactions | Small |
| Plaid-primary fallback (Tier 3) | Cold start for brand-new users | Small |
| Prune stats on category deletion | Zombie categories silently blocking Tier 2 | Small |
| Vote cap/decay or rolling window | Stale votes never expiring | Medium |
| Surface learned defaults in UI | No visibility into why a transaction was categorized | Medium |
| Pin a learned default as a permanent rule | Bridges Tier 2 confidence into Tier 1 durability | Medium–Large |
| Edit automations in place | Minor UX gap (delete-and-recreate today) | Small |
| Unit tests for `resolveWinner` / `normalizeMerchant` | Silent-failure risk in the two most load-bearing pure functions | Small |