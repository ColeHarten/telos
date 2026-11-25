# Using Telos

A tour of each page, plus the ideas that tie them together. For how the numbers are worked out, see [Calculations](calculations.md).

## Core ideas

**Accounts hold money.** Each account is an asset (cash, investments, retirement, property, crypto, other) or a liability (credit card, loan, other). Linked accounts sync from your bank. Manual accounts are ones you keep up to date yourself.

**Categories describe money.** Every category has a kind:

| Kind | Examples | Counts toward |
|---|---|---|
| Income | Salary, interest | Income and cash flow |
| Expense | Groceries, rent | Spending and cash flow |
| Transfer | Savings deposit, credit-card payment, 401(k) contribution | The destination account's budget line, not cash flow |

A transfer category always points at a destination account.

**Transactions get a category,** either from you or automatically during sync. Transactions without one show as **Needs Review**.

**Sync is on demand.** New transactions arrive when you press Sync on the Transactions page, refresh balances on the Accounts page, link a bank, or reconnect one.

## Dashboard

A one-screen summary of the current month:

- **Net worth** split into cash, investments, and debt.
- **Spending vs. budget:** this month's expense actuals against the planned amounts saved on the Budgets page.
- **Income actual vs. expected,** where expected is the planned income saved on the Budgets page.
- **Net this month:** income actual minus expense actual.
- **Cash flow trend** for the last six months, with transfers left out.
- **Needs Review:** uncategorized transactions waiting for you.
- **Recent transactions** and your **accounts,** with links to the full pages.

The Dashboard reads only budget amounts you've saved. A Budgets line still showing its default estimate counts as 0 here until you enter an amount.

## Accounts

- **Connect a bank** through Plaid Link. Telos adds every account at that login. If an account is already in Telos, it's skipped rather than added twice. If that existing account is archived, you're asked to restore it instead.
- **Add a manual account** for anything Plaid can't reach, such as a house, a car loan, or cash. You set its balance.
- **Refresh balances** syncs every linked bank, which updates balances and transactions.
- **Reconnect** appears on a bank when it needs you to sign in again (for example, after a password change). It reopens Plaid Link for that bank without creating a new connection.
- **Contribution eligible** marks an account that paycheck deductions can feed, such as a 401(k) or HSA. Only these accounts can be linked from a deduction on the Categories page.

### Archive, disconnect, and delete

These do different things:

| Action | What happens | Reversible |
|---|---|---|
| **Archive** | Hides the account from lists and net worth. A linked account keeps syncing in the background, so there are no gaps if you restore it. | Yes, with **Restore**. |
| **Disconnect bank** | Stops syncing every account at that bank and revokes Telos's access at Plaid. The accounts become manual accounts: history is kept and the balance freezes at its last value. | No. Linking the bank again creates new accounts. |
| **Delete permanently** | Only for archived accounts. Removes the account and its own transactions. Blocked while other data points at the account (see below). | No. |

Delete is blocked while any of these exist, and the message tells you which:

- Transactions categorized as transfers **into** the account.
- A transfer category whose destination is the account.
- A paycheck deduction that contributes to the account.

Archiving shows the same list as a warning, but lets you go ahead.

## Categories

- **Add, edit, archive, and restore** income, expense, and transfer categories. Archived categories stop receiving new automatic assignments, and their past money still shows on the Budgets page in a separate line.
- **Estimated monthly** is the starting budget amount for the category.
- **Paycheck details** (income categories only): enter gross pay per paycheck, pay frequency, and deductions (taxes, pre-tax, and post-tax). Telos works out net pay and the monthly estimate.
- **Deductions linked to an account** (for example, a 401(k) contribution) automatically create a matching transfer category. It's renamed, updated, or removed whenever you change the deduction. These show under their income category and are marked "Managed by income category".

## Budgets

Pick a month. Lines are grouped into:

| Group | Lines | Actual |
|---|---|---|
| Income | Each active income category | Income received, net of reversals |
| Expenses | Each active expense category | Spending, net of refunds |
| Savings | Each active asset account | Transfers into the account |
| Debt | Each active liability account | Transfers into the account (payments) |

Type a planned amount and it saves on its own a moment later. A category line you haven't set yet shows the category's monthly estimate; an account line shows 0. Edits in two browser tabs don't overwrite each other.

If any money this month landed on archived categories, it shows in a separate line so totals still add up.

## Transactions

- **Search and filter** by text, date range, status (pending or posted), flow (in or out), amount, and account.
- **Categorize** a transaction by picking a category. Clearing the choice sends it back to Needs Review.
- After you categorize one, Telos may offer to **create an automation** so future transactions from that merchant go to the same category.
- **Sync** pulls new and changed transactions from every bank. **Last Synced** shows when that last finished, and "Syncing…" while it runs. If a bank needs reconnecting or fails, a message says so; the other banks still sync.
- The page loads the last 24 months. **Load older transactions** adds 12 months at a time.

When a pending transaction posts, it keeps the category you gave it while it was pending.

## Automations

A list of your merchant rules. Each sends every new transaction from one merchant to one category. You can search and delete them here. To change one, create a new one for the same merchant from the Transactions page; it replaces the old one.

Automations apply to new transactions in later syncs, and to uncategorized transactions that Plaid updates. They never change a transaction that already has a category.

## Settings

Shows the Google account you're signed in with.

## Signing in and out

Telos uses Google sign-in. Every page except the login page needs you to be signed in. If you're already signed in, the login page sends you to the Dashboard.
