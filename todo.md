# TODOs
# Budgeting App Status and Tomorrow Plan

## Current State

The app is a personal budgeting app built with Next.js, TypeScript, MUI, Firebase Auth, and Firestore.

The core Phase 1 data model is now:

```txt
users/{uid}
users/{uid}/settings/app
users/{uid}/cashflows/{cashflowId}
users/{uid}/accounts/{accountId}
users/{uid}/budgets/{monthKey}
```

The main conceptual split is:

```txt
Cashflows = why money moves
Accounts = where money lives or what debt exists
Budgets = planned monthly income, expenses, savings allocations, and debt payments
```

Cashflows now support:

```ts
kind: "income" | "expense"
```

Accounts now support:

```ts
normalBalance: "asset" | "liability"
```

Budgets now use both cashflows and accounts:

```ts
lineType: "cashflow" | "account_transfer"
```

Cashflow lines are used for income and expense categories. Account transfer lines are used for savings contributions, brokerage contributions, credit card payments, loan payments, and other planned allocations.

The current pages have Firestore support:

```txt
/accounts
- Reads authenticated user's accounts
- Adds accounts
- Edits accounts
- Archives accounts
- Summarizes assets, liabilities, and net position

/cashflows
- Reads authenticated user's cashflows
- Adds cashflows
- Edits cashflows
- Archives cashflows
- Summarizes income and expense category counts

/settings
- Reads/writes users/{uid}/settings/app
- Saves currency and default budget month

/budgets
- Reads cashflows and accounts
- Reads selected month budget
- Stores budget lines in users/{uid}/budgets/{monthKey}
- Supports income, expenses, savings allocations, and debt allocations

/dashboard
- Reads current month budget
- Reads cashflows and accounts
- Displays projected income, expenses, savings, debt payments, remaining cash flow, budget breakdown, and top planned expenses
```

Important project preferences:

```txt
Do not use MUI Stack.
Use Box, Grid, or plain flex containers instead.

Prefer explicit pixel values in sx/CSS:
"8px", "12px", "16px", "24px", "40px"

Avoid MUI spacing numbers like p: 2, gap: 2 unless there is a clear reason.
```

## Tomorrow Plan

### 1. Move shared types out of pages

Create a shared file, likely:

```txt
src/lib/types.ts
```

Move repeated app types there:

```ts
CashflowKind
Cashflow
AccountType
NormalBalance
Account
BudgetLineType
BudgetLine
BudgetLines
MonthlyBudget
Currency
DefaultBudgetMonth
AppSettings
```

Then update pages to import these shared types instead of redefining them.

Goal:

```txt
No duplicated domain types inside page files.
Pages become thinner and easier to maintain.
```

After this step, run TypeScript/build checks before continuing.

---

### 2. Move Firestore reads/writes into a trusted data storage hook

Create a central hook, likely:

```txt
src/lib/useBudgetingData.ts
```

or:

```txt
src/hooks/useBudgetingData.ts
```

This hook should own authenticated user data access:

```ts
useBudgetingData()
```

It should provide:

```ts
user
settings
cashflows
accounts
selectedMonthKey
selectedBudget
isLoading
error

setSelectedMonthKey
addCashflow
updateCashflow
archiveCashflow
addAccount
updateAccount
archiveAccount
saveBudget
copyPreviousMonthBudget
updateSettings
```

Pages should stop directly calling Firestore where possible. Instead, they should call the hook.

Goal:

```txt
Pages render UI.
The data hook owns auth state, Firestore subscriptions, mutations, loading states, and errors.
```

This is the most important cleanup because accounts, cashflows, budgets, and dashboard currently duplicate some data-loading logic.

After this step, test:

```txt
/accounts still loads/adds/edits/archives
/cashflows still loads/adds/edits/archives
/settings still loads/saves
/budgets still loads/saves
/dashboard still reflects saved budget data
```

---

### 3. Add better support for viewing and editing different months

Improve the month model so the user can easily switch budget months.

Likely additions:

```txt
selectedMonthKey shared in the data hook
default month from settings
month navigation controls
copy previous month behavior
clear loading behavior when changing months
```

Budget page should support:

```txt
Current selected month
Previous month button
Next month button
Month picker
Copy previous month
Save budget
```

Dashboard should use the same selected/default month behavior, or intentionally use the default month from settings.

Need to decide:

```txt
Option A: Dashboard always shows default budget month.
Option B: Dashboard and Budgets share selectedMonthKey while navigating.
```

Recommended starting point:

```txt
Budgets page controls selectedMonthKey.
Dashboard uses the default budget month from settings.
```

Later, we can add a global month selector if needed.

---

### 4. Test correctness

Do a correctness pass after the refactor.

Manual test checklist:

```txt
Auth
- Signed-in user can load pages.
- Signed-out user is redirected to login.

Cashflows
- Add income cashflow.
- Add expense cashflow.
- Edit cashflow name/type.
- Archive cashflow.
- Archived cashflow disappears from active list.

Accounts
- Add asset account.
- Add liability account.
- Edit account name/type/balance.
- Archive account.
- Archived account disappears from active list.

Budgets
- Budget page pulls active cashflows.
- Budget page pulls active accounts.
- Income cashflows appear in Income.
- Expense cashflows appear in Expenses.
- Asset accounts appear in Savings.
- Liability accounts appear in Debt.
- Save budget writes users/{uid}/budgets/{monthKey}.
- Reload page and saved values persist.
- Change month and values change appropriately.
- Copy previous month works.

Dashboard
- Dashboard reads selected/current/default month budget.
- Summary totals match budget page.
- Top planned expenses are sorted correctly.
- Breakdown percentages add up sensibly.
- Empty budget state does not crash.

Soft-delete safety
- Archived cashflows/accounts do not appear as new budget options.
- Existing budget lines referencing archived/missing items do not crash.
```

## Suggested Order

The proposed order is good, with one adjustment:

```txt
1. Move types into types.ts
2. Do a quick compile/test
3. Move data reads/writes into useBudgetingData
4. Do another compile/test
5. Improve month viewing/editing
6. Do full correctness testing
```

The data hook should come before better month support because month support will be cleaner if selected month state and budget loading are centralized first.










## Long-term TODOs 
- Add linked expenses (such as tax)
- Add better support for tax accounting such as by pulling tax bracket data
    - Lot of potential here
- Add better support for debt (interest, compounding, etc.)