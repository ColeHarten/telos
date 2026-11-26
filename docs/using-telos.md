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

**Telos syncs while it's open.** When you open it, any bank whose data is over six hours old syncs. While a bank is importing its history, Telos checks every two minutes. You can also press Sync on the Transactions page, Refresh Balances on the Accounts page, or Refresh on a bank's card. Nothing syncs while Telos is closed.

## Dashboard

A one-screen summary of the current month:

- **Net worth** split into cash, investments, and debt.
- **Spending vs. budget:** this month's expense actuals against the planned amounts saved on the Budgets page.
- **Income actual vs. expected,** where expected is the planned income saved on the Budgets page.
- **Net this month:** income actual minus expense actual.
- **Cash flow trend** for the last six months, with transfers left out.
- **Needs Review:** uncategorized transactions waiting for you.
- **Recent transactions** and your **accounts,** with links to the full pages.

Planned figures match the Budgets page: your amount, or the category's monthly estimate until you set one.

## Accounts

- **Connect a bank** (Add Account > Connect a Bank) first lists the banks already connected, with each account's last four digits, and how many of your Plaid plan's connections are used. Each new bank login uses one, and Plaid doesn't give it back when you disconnect, so check the list first. To add an account at a bank that's already connected, use **Manage accounts** on its card instead.
- **Duplicates are stopped before they cost anything.** If the login you pick is already connected, Telos refuses it and points you to Manage accounts or Reconnect (or to Restore, if a matching account is archived). If it's a second login at a bank that's already connected, such as a joint or business login, Telos asks you to confirm first.
- **Banks that send you to their own site** (Chase, Capital One, and others) return you to Telos's `/oauth` page, which finishes the link. Finish in the same browser you started in.
- **Add a manual account** for anything Plaid can't reach, such as a house, a car loan, or cash. You set its balance.
- **Refresh Balances** syncs every linked bank, which updates balances and transactions.
- **Contribution eligible** marks an account that paycheck deductions can feed, such as a 401(k) or HSA. Only these accounts can be linked from a deduction on the Categories page.

### Bank connections

Each connected bank has a card above the accounts table, with its status, when it last synced, and its accounts.

| Status | Meaning |
|---|---|
| **Up to date** | The last sync worked. |
| **Importing history…** | Plaid is still sending the two years of history, which can take minutes or a few hours. Telos checks every two minutes; there's nothing to press. |
| **Needs reconnect** | The bank needs you to sign in again, for example after a password change. Press **Reconnect**. |
| **Access expiring** | Your consent at the bank runs out within 14 days (banks that send you to their own site set an expiry). Press **Reconnect** to renew it. |
| **Sync failed** | The last sync hit an error. Telos retries on its own. |
| **Not shared** (on an account) | The bank no longer shares this account. Its history stays. |

Its buttons:

- **Refresh** asks the bank for new transactions now. Plaid normally checks one to four times a day; anything new arrives within a few minutes.
- **Manage accounts** reopens Plaid for this bank so you can share accounts you left out, or stop sharing some. It doesn't use a connection.
- **Reconnect** signs in to the bank again. It doesn't use a connection either.
- **Rebuild from Plaid** (in the menu) re-imports the bank's full history and keeps your categories. Use it when transactions look wrong, instead of disconnecting.
- **Disconnect** (in the menu) asks you to type DISCONNECT, and warns that linking the bank again uses another connection.

### Archive, disconnect, and delete

These do different things:

| Action | What happens | Reversible |
|---|---|---|
| **Archive** | Hides the account from lists and net worth. A linked account keeps syncing in the background, so there are no gaps if you restore it. | Yes, with **Restore**. |
| **Disconnect** | On the bank's card. Stops syncing every account at that bank and revokes Telos's access at Plaid. The accounts become manual accounts: history is kept and the balance freezes at its last value. | No. Linking the bank again reattaches the accounts and keeps your categories, but uses another connection. |
| **Delete permanently** | Only for archived accounts. Removes the account, its own transactions, and its balance history. Blocked while the bank still shares the account, or while other data points at it (see below). Never disconnects the bank. | No. |

Delete is blocked while any of these exist, and the message tells you which:

- Transactions categorized as transfers **into** the account.
- A transfer category whose destination is the account.
- A paycheck deduction that contributes to the account.
- The bank still shares the account. Stop sharing it with Manage accounts, or disconnect the bank, first; otherwise the next sync would bring it back.

Archiving shows the same list as a warning, but lets you go ahead.

## Categories

- **Add, edit, archive, and restore** income, expense, and transfer categories. Archived categories stop receiving new automatic assignments, and their past money still shows on the Budgets page in a separate line.
- **Type** (income, expense, or transfer) is set when you create the category and can't be changed later, because each transaction keeps its type. To switch, create a new category and move the transactions.
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

Type a planned amount and it saves on its own a moment later. A category line you haven't set yet shows the category's monthly estimate, and the totals count it; an account line shows 0. Edits in two browser tabs don't overwrite each other.

If any money this month landed on archived categories, it shows in a separate line so totals still add up.

## Transactions

- **Search and filter** by text, date range, status (pending or posted), flow (in or out), amount, and account.
- **Categorize** a transaction by picking a category. Pick **Unassigned** to send it back to Needs Review.
- After you categorize one, Telos may offer to **create an automation** so future transactions from that merchant go to the same category. It doesn't offer if that automation already exists.
- **Summary cards** (inflows, outflows, and net) cover the selected account and dates, and leave out transfers between your own accounts.
- **Sync** pulls new and changed transactions from every bank, and "Syncing…" shows while it runs. **Last Synced** shows the bank synced longest ago, so one stuck bank isn't hidden by the others, with a note under it when a bank is importing or needs attention. If a bank needs reconnecting or fails, a message says so; the other banks still sync.
- Telos loads the last 24 months once per visit, shared by every page. **Load older transactions** adds 12 months at a time.

When a pending transaction posts, it keeps the category you gave it while it was pending.

## Automations

A list of your merchant rules. Each sends every new transaction from one merchant to one category. You can search and delete them here. To change one, create a new one for the same merchant from the Transactions page; it replaces the old one.

Automations apply to new transactions in later syncs, and to uncategorized transactions that Plaid updates. They never change a transaction that already has a category.

## Settings

Shows the Google account you're signed in with, **Export transactions (CSV)**, which downloads every transaction with its account and category names (money in is positive), and a **Sign Out** button.

## Signing in and out

Telos uses Google sign-in. Every page except the login page needs you to be signed in. If you're already signed in, the login page sends you to the Dashboard.
