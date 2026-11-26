# Calculations

How every number on the Dashboard and Budgets pages is worked out. The math is in `lib/budgetCalculations.ts` and `lib/paycheck/paycheck.ts`, and both pages use the same functions.

## Signs

Telos keeps Plaid's sign convention on every transaction:

| Amount | Means |
|---|---|
| Positive | Money **out** (a purchase, a bill, a transfer out) |
| Negative | Money **in** (a paycheck, a refund, a transfer in) |

## Months

Months are `YYYY-MM` keys in your local time zone. A transaction belongs to a month when its `date` (`YYYY-MM-DD`) starts with that key.

## Category actuals

`categoryActuals` gives each income and expense category's total for one month.

- **Expense categories:** money out minus money in. A $50 purchase and a $20 refund give $30.
- **Income categories:** money in minus money out. A $2,000 paycheck and a $100 reversal give $1,900.
- Each total is **floored at 0**, so a month with more refunds than spending shows $0, not a negative.
- Transfers, uncategorized transactions, and hidden transactions aren't included.

### Archived categories

Budget lines show active categories only. So money on archived categories isn't lost from the totals, `archivedCategoryActuals` adds it up separately (income, expense, and a transaction count). The Budgets page shows it in a warning above the lines (not in the line totals), and the Dashboard includes it in income and spending actuals.

## Savings and debt actuals

`transferActualsByAccount` gives each account the net money moved into it by transfers that month, counted once. This is the **Actual** on Savings (asset accounts) and Debt (liability accounts) budget lines.

- **A linked account** is counted from its own transactions: every transfer into it adds, and every transfer out of it subtracts. A credit card's payments are the money into it.
- **A manual account** has no transactions of its own, so it's counted from the transfers categorized to it: money sent to it adds, and money taken out of it subtracts.
- Transfers categorized to a linked account aren't counted again from the sending side.
- Each total is **floored at 0**, and hidden transactions don't count.

For example, $300 moved from checking to a linked savings account and $100 taken back out gives savings an actual of $200.

## Cash flow

`monthCashFlow` gives inflow, outflow, and net for a month, **leaving out transfers** and hidden transactions, since moving money between your own accounts isn't income or spending.

A transaction counts as a transfer when either:

- You (or a rule) categorized it as a transfer, or
- It has no category and is paired with its other leg in another of your accounts (see [Categorization](categorization.md#transfers-between-your-accounts)), or
- It has no category and Plaid labels it a transfer (`TRANSFER_IN`, `TRANSFER_OUT`), a card or loan payment (`LOAN_PAYMENTS`), or a loan disbursement (`LOAN_DISBURSEMENTS`).

A transaction you categorized as income or expense always counts, whatever Plaid calls it.

Inflow is the sum of money in, outflow is the sum of money out, and net is inflow minus outflow.

## Net worth

`netWorth` covers **active** accounts only (archived ones are left out).

| Part | Accounts |
|---|---|
| Cash | Asset accounts of type `cash` |
| Investments | All other asset accounts (investment, retirement, property, crypto, other) |
| Debt | Liability accounts |
| **Total** | Cash + investments − debt |

An account's balance is `currentBalance`, or `startingBalance` if there's no current balance. Linked accounts get a fresh balance on every sync; manual accounts keep the balance you set.

## Budgets

A month's budget is a set of planned amounts, one per line (see [Data model](data-model.md#budgetsyyyy-mm)).

| Group | Planned | Actual |
|---|---|---|
| Income | Your amount, or the category's `estimatedMonthly` until you set one | Category actual |
| Expenses | Your amount, or the category's `estimatedMonthly` until you set one | Category actual |
| Savings | Your amount, or 0 | Transfers into the account |
| Debt | Your amount, or 0 | Transfers into the account |

Budget lines save themselves a moment after you stop typing. Each line is written as its own field with a merge, so edits to different lines from two tabs both survive. While a line has unsaved changes, an update from another tab won't replace what you're typing.

**Uncategorized.** `uncategorizedSpending` adds up money out in the month that's still in Needs Review (uncategorized, not hidden, and not a transfer). The Budgets page shows it as an Uncategorized line under Expenses, with no planned amount, so expense actuals plus this line match the month's cash-flow outflow.

**Shortcuts** (`lib/budgetTools.ts`). `copyLines` gives each line the amount it showed last month: last month's saved line, or the category's estimate (0 for an account) if it was never set. `estimateLines` gives each income and expense line its category's `estimatedMonthly`. Both round to cents, and the page saves them like typed amounts.

**Planned amounts.** `plannedAmount` gives a category's planned amount: the saved line, or the category's `estimatedMonthly` if the line was never set. The Budgets totals add up the amounts shown on the lines, and the Dashboard's planned figures (spending vs. budget, expected income) use `plannedAmount`, so the two pages agree.

## Paycheck

`calculateWithholdings` (`lib/paycheck/paycheck.ts`) works per paycheck, then converts to monthly.

**Per paycheck:**

- Each deduction is either a percent of gross (`value`% × gross) or a flat amount (`value`).
- Total withheld is the sum of all deductions, taxes included.
- Net pay = gross − total withheld, never below 0.

Every percentage is taken of gross pay. Pre-tax and post-tax deductions are calculated the same way; the type only decides whether the deduction can feed an account.

**Monthly**, by pay frequency:

| Frequency | Paychecks a year | Monthly multiplier |
|---|---|---|
| Weekly | 52 | 52 ÷ 12 |
| Bi-weekly | 26 | 26 ÷ 12 |
| Semi-monthly | 24 | 2 |
| Monthly | 12 | 1 |

The category's `estimatedMonthly` becomes the monthly net pay. Each non-tax deduction linked to an account gets a monthly amount (per-paycheck amount × multiplier), which becomes its transfer category's monthly estimate (see [Categorization](categorization.md#paycheck-transfers)).

### Example

Bi-weekly gross of $4,000, with 20% tax and a $400 flat 401(k) contribution linked to a 401(k) account:

- Withheld: $800 + $400 = $1,200. Net per paycheck: $2,800.
- Monthly net: $2,800 × 26 ÷ 12 = $6,066.67.
- 401(k) monthly transfer: $400 × 26 ÷ 12 = $866.67.
