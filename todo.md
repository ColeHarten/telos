# TODO
1. When adding an account, build the "eligible for paycheck transfer" into it
2. Don't allow used to add same acc twice
3. ~~Setting page (just simplify for now)~~
4. Check (and maybe improve) the automations








# #############################
# --- THIS MAY ALL BE DONE IDK
# #############################

# Feature: Contribution-Eligible Accounts + Paycheck-Linked Transfers

**Status as of this doc: fully designed, zero code written.** Everything below is planning — nothing has been implemented yet. This is a resume-point, not a changelog.

---

## 1. The problem

Pre-tax and post-tax paycheck deductions (401(k), HSA, etc.) currently reduce the income category's `estimatedMonthly` (via `calculateWithholdings` in `paycheck.ts`) and then that money just disappears from the app's data model. If the destination account (e.g. a 401(k)) is also tracked as an `Account`, there's no link between "money left your paycheck" and "money arrived in that account" — so budgets and account tracking are silently disconnected for that dollar amount.

## 2. The design (agreed)

- A retirement/HSA/etc. contribution should show up as a **transfer Category** (reusing your existing `kind: "transfer"` + `transferAccountId` machinery) — not as a direct balance bump and not as a new subsystem.
- The account link lives **per deduction row**, not per Paycheck Profile — so a profile can have one deduction going to a 401(k) and another going to an HSA, tracked separately.
- Eligibility to be a contribution destination is an **explicit boolean on `Account`**, not inferred from `accountType` — because accountType has no HSA option and inference would silently misclassify accounts.

## 3. Data model changes (not yet applied to `types.ts`)

```typescript
// On Account:
isContributionEligible: boolean; // default false — same pattern as isManual/isArchived

// On Deduction:
id: string;                        // NEW — stable key, generated client-side (crypto.randomUUID())
linkedAccountId?: string | null;   // NEW — only meaningful when type is preTaxDeduction/postTaxDeduction

// On Category:
sourceIncomeCategoryId?: string | null; // NEW — marks this as auto-created from a paycheck profile
sourceDeductionId?: string | null;      // NEW — which deduction row created/owns this transfer category
```

**Why `Deduction` needs an `id`:** deduction rows currently have no stable identity (`{ label, value, kind, type }` only). Without an id, the reconciliation logic that finds "the transfer category I made for this deduction last time" would have to key off `label`, which breaks the moment someone renames a deduction — causing duplicate transfer categories instead of updating the existing one.

**Migration concern (unresolved):** existing saved paycheck profiles have deductions with no `id`. The edit form needs to backfill an id on load (or the first re-save of an old profile will treat every row as new — not catastrophic, just creates redundant transfer categories on first save post-migration). Needs a decision before shipping.

## 4. Files touched, by status

| File | Status | What's needed |
|---|---|---|
| `types.ts` | Have current version | Add the 5 fields listed in §3 |
| `AccountFormDialog.tsx` | Have current version | Add `isContributionEligible` toggle (Switch), wire into `onSave` payload |
| `useAccounts.ts` | Have current version | Extend `addManualAccount`/`updateAccount` payloads + Firestore write + `onSnapshot` read-mapper for `isContributionEligible` |
| `paycheck.ts` (`calculateWithholdings`) | Have current version | Currently only returns aggregate totals (`netPay`, `totalWithheld`, `estimatedMonthlyNet`, etc.). **Needs a new per-deduction breakdown** — something like `deductionBreakdown: { deductionId, linkedAccountId, monthlyAmount }[]` — so the sync step knows exactly how much to put in each linked transfer category. |
| `AddCategoryModal.tsx` | Have current version | Add account-picker `Autocomplete` to deduction rows (only for `preTaxDeduction`/`postTaxDeduction` types), filtered to `accounts.filter(a => a.isContributionEligible && !a.isArchived)`. Same pattern as the existing transfer-destination picker already in this file. |
| `useCategories.ts` | Have current version | **`addCategory` currently returns nothing — needs to return the new doc's ID**, so the reconciliation step can stamp `sourceIncomeCategoryId` onto transfer categories created in the same save. |
| `CategoriesPage.tsx` | **Missing — need current version** | Likely where the actual "paycheck save → reconcile transfer categories" orchestration should live, since it already owns `handleSaveCategoryForm`. |
| Account list page / whatever wires `AccountFormDialog`'s `onSave` to `addManualAccount`/`updateAccount` | **Missing entirely — not yet seen** | Need this to extend the save payload correctly; don't know today whether add vs. update is decided here or elsewhere. |
| New: reconciliation logic (sync step) | **Does not exist as a concept anywhere in the codebase today** | This is genuinely new logic, not an edit to something existing — see §5. |

## 5. The core gap: there is no "sync" to extend

Earlier assumption was wrong: there's no existing hook/function that syncs paycheck profile → category. `AddCategoryModal.tsx`'s `handleSubmit` just computes `estimatedMonthlyNet` inline and stuffs it into a flat payload; `useCategories.ts`'s `addCategory`/`updateCategory` are dumb CRUD with no concept of derived data or reconciliation.

**New logic needed**, most likely living in `CategoriesPage.tsx`'s `handleSaveCategoryForm` (or a new dedicated function it calls):

1. After saving the income category (existing behavior, unchanged), get its ID (requires `addCategory` to return one — see §4).
2. For each deduction row with a `linkedAccountId`:
   - Look for an existing Category where `sourceDeductionId === deduction.id`.
   - If found: update its `estimatedMonthly` to the new computed amount (from `paycheck.ts`'s new breakdown) and its `transferAccountId` (in case the link changed).
   - If not found: create a new `transfer`-kind Category, stamped with `sourceIncomeCategoryId` and `sourceDeductionId`.
3. For any existing transfer category whose `sourceDeductionId` no longer matches a deduction on the profile (row deleted or unlinked): **archive it** (agreed default — matches how stale accounts/categories are already handled elsewhere; never hard-delete).

## 6. Open decisions — defaults proposed, not yet confirmed

| Question | Proposed default | Rationale |
|---|---|---|
| Deduction unlinked/removed — delete or archive its transfer category? | **Archive** | Consistent with existing archive-don't-delete pattern |
| Should the auto-created transfer category's `estimatedMonthly` be locked/read-only in the UI (like the income category's synced field already is)? | **Yes, lock it** | Otherwise a hand-edit gets silently clobbered on the next paycheck save |
| Can two deduction rows link to the same account (e.g. separate "401k" and "employer match" rows, same destination)? | **Allow it** — key by `deductionId`, not `linkedAccountId` | Keying by account would silently merge distinct rows into one category |

**These need your explicit confirmation before implementation starts** — they affect money correctness and aren't safe to assume silently.

## 7. Plaid interaction (already discussed, no action needed)

- Selecting an account as contribution-eligible works identically for Plaid-linked and manual accounts — the flag lives on `Account` regardless of `isManual`.
- Pre-tax deductions never appear as Plaid transactions on the source (checking) side, since payroll routes that money before it hits checking — no double-count risk there.
- Destination-side risk only exists if the retirement account is Plaid-linked **and** you're pulling transaction-level data on it (Plaid Investments product) — not currently integrated in `syncService.ts`, so this is a non-issue today. If that integration is ever added, keep budgeted transfer amounts and real synced transactions conceptually separate (planned vs. actual), don't try to reconcile them into one number.

## 8. Suggested build order (unchanged from original roadmap)

1. `types.ts` — foundation
2. `AccountFormDialog.tsx` + `useAccounts.ts` — get `isContributionEligible` working standalone, testable in isolation before touching paycheck logic
3. `paycheck.ts` — add the per-deduction breakdown; verify existing `netPay`/`estimatedMonthlyNet` display still works unchanged
4. `AddCategoryModal.tsx` — wire up the account picker on deduction rows
5. `useCategories.ts` — make `addCategory` return the new ID
6. Reconciliation logic in `CategoriesPage.tsx` (or extracted function) — highest-risk step, do last once everything upstream is verified

## 9. To resume: what to bring back to this conversation

1. Confirm or revise the 3 open decisions in §6.
2. Paste **`CategoriesPage.tsx`** (current version).
3. Paste whichever file wires `AccountFormDialog` to `useAccounts`'s `addManualAccount`/`updateAccount` (the accounts list page — not yet shared).
4. Decide the migration approach for existing deductions with no `id` (§3).

Once those four things are in hand, implementation can start at step 1 of the build order in §8.