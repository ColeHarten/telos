# Budgeting App — Overview

## What this app is

A personal budgeting app that helps answer two related questions:

1. **Planning:** If I project my income and expenses forward, how much money is left over after retirement, savings, and debt payments?
2. **Tracking (future):** How does my *actual* money — pulled from real bank/credit/investment accounts via Plaid — flow into and out of those same accounts, and how does that compare to the plan?

The app is built in two phases. Phase 1 is a pure planning tool with manually entered data. Phase 2 layers in Plaid to ground the plan in real transaction and balance data.

## Tech stack

- Next.js + TypeScript
- MUI for UI components
- Firebase Auth for authentication
- Firestore for data storage

## Core domain model

The data model is split into three concepts that map to three different questions:

| Concept | Question it answers |
|---|---|
| **Cashflows** | *Why* does money move? (income and expense categories) |
| **Accounts** | *Where* does money live, or what debt exists? (assets and liabilities) |
| **Budgets** | *What's the plan* for a given month? (income, expenses, savings allocations, debt payments) |

### Cashflows

Represent categories of recurring or planned income/expense.

```ts
kind: "income" | "expense"
```

Examples: salary, freelance income, rent, groceries, subscriptions.

### Accounts

Represent where money sits or what's owed.

```ts
normalBalance: "asset" | "liability"
```

Examples of assets: checking, savings, brokerage accounts. Examples of liabilities: credit cards, loans, mortgages.

### Budgets

A monthly plan that ties cashflows and accounts together via budget lines.

```ts
lineType: "cashflow" | "account_transfer"
```

- **Cashflow lines** — planned income or expense amounts, tied to a Cashflow category.
- **Account transfer lines** — planned movements of money into/out of an Account: retirement contributions, brokerage contributions, credit card payments, loan payments, etc.

A budget for a given month therefore answers: *given my expected income and expenses this month, how much goes toward savings and debt, and what's left over?*

### Firestore structure

```txt
users/{uid}
users/{uid}/settings/app
users/{uid}/cashflows/{cashflowId}
users/{uid}/accounts/{accountId}
users/{uid}/budgets/{monthKey}
```

## Phase 1 — Planning (current)

Phase 1 is entirely forward-looking and manually entered. There's no connection to real bank data — the user defines their own cashflows and accounts, and builds a budget by hand for each month.

**Pages:**

- **`/cashflows`** — CRUD for income/expense categories. Supports archiving (soft delete) rather than hard deletion, so historical budget lines that reference a cashflow don't break.
- **`/accounts`** — CRUD for asset/liability accounts, with the same archive pattern. Summarizes total assets, liabilities, and net position.
- **`/budgets`** — The core planning surface. For a selected month, pulls active cashflows and accounts and lets the user build out planned income, expenses, savings allocations, and debt payments. Supports navigating between months and copying a previous month's budget as a starting point.
- **`/dashboard`** — A read-only summary view: projected income, expenses, savings, debt payments, leftover cash flow, a budget breakdown, and top planned expenses.
- **`/settings`** — User-level preferences: currency, default budget month.

**The central question Phase 1 answers:** *based on what I plan to earn and spend, how much money is left over each month after I fund savings and pay down debt?*

## Phase 2 — Plaid integration (planned)

Phase 2 connects to real financial institutions via Plaid to ground the plan in actual transaction and balance data, rather than relying purely on manual projections.

At a high level, this phase should:

- Link real bank, credit card, and investment accounts to the existing `Account` model (so a Plaid-linked checking account *is* an asset Account, not a separate concept).
- Pull real transactions and map them to existing Cashflow categories — either automatically (via Plaid categories or custom rules) or manually.
- Compare actual income/expenses/transfers against the planned Budget for the month, surfacing variance (planned vs. actual).
- Use real account balances to track actual net worth alongside the projected one.

This phase is intentionally deferred until the Phase 1 data model and UI are solid, since Accounts and Cashflows need to be stable abstractions before real transaction data gets mapped onto them.

## Long-term ideas (post-Phase 2)

- **Linked expenses** — expenses that derive from other values rather than being entered directly (e.g., tax owed as a function of income).
- **Tax-aware accounting** — pull in tax bracket data to more accurately project take-home income and tax liabilities.
- **Rules engine** — a system for backfilling real (Plaid) transactions to the *original* planned expense they belong to, net of tax and other adjustments. This is likely the biggest lift and depends heavily on Phase 2 being in place.
- **Richer debt modeling** — interest accrual, compounding, payoff projections, rather than treating debt payments as flat planned transfers.

## Engineering conventions

- Don't use MUI `Stack` — use `Box`, `Grid`, or plain flex containers.
- Prefer explicit pixel values in `sx`/CSS (e.g. `"8px"`, `"16px"`) over MUI spacing shorthand (`p: 2`, `gap: 2`).
- Soft-delete (archive) rather than hard-delete Cashflows and Accounts, since Budgets reference them by ID and shouldn't break if the referenced item is later archived.