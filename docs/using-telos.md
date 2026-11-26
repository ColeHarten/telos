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

**Transactions get a category,** either from you or automatically during sync: from your rules, from merchants you've categorized before, or from the Plaid categories you map to your categories. Transactions without one show as **Needs Review**, except transfers between your accounts and card and loan payments, which are transfers already.

**Telos syncs while it's open.** When you open it, any bank whose data is over six hours old syncs. While a bank is importing its history, Telos checks every two minutes. You can also press Sync on the Transactions page, Refresh Balances on the Accounts page, or Refresh on a bank's card. Nothing syncs while Telos is closed.

**The sync chip** at the top of every page shows "Synced 5m ago" (for the bank synced longest ago), "Syncing…", "Importing history…", or how many banks need attention. Click it to sync now, or to open Accounts when a bank needs you. It appears once a bank is connected.

**The menu** shows how many transactions need review next to Transactions.

## Dashboard

A one-screen summary of a month (the current one unless you pick another):

- **Get set up:** a checklist (categories, rules, your first bank, Needs Review, and a budget) that stays until every step is done once. **Hide checklist** removes it in this browser.
- **Net worth** split into cash, investments, and debt.
- **Spending vs. budget:** the month's expense actuals, including money on archived categories, against its planned expenses.
- **Income actual vs. expected,** where expected is the month's planned income.
- **Net this month:** income actual minus expense actual.
- **Cash flow trend** for the last six months, with transfers left out.
- **Needs Review:** uncategorized transactions waiting for you.
- **Recent transactions** and your **accounts,** with links to the full pages.

Planned figures match the Budgets page: your amount, or the category's monthly estimate until you set one.

## Accounts

- **Connect a bank** (Add Account > Connect a Bank) first lists the banks already connected, with each account's last four digits, and how many of your Plaid plan's connections are used. Telos prepares Plaid while you read, so **Continue to Plaid** shows a spinner for a moment and then opens Plaid at once. Each new bank login uses one, and Plaid doesn't give it back when you disconnect, so check the list first. To add an account at a bank that's already connected, use **Manage accounts** on its card instead.
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

- **Add, edit, archive, and restore** income, expense, and transfer categories. Archived categories stop receiving new automatic assignments. Their past money stays in the Dashboard's totals; on the Budgets page, a warning above the lines says how much there is.
- **Type** (income, expense, or transfer) is set when you create the category and can't be changed later, because each transaction keeps its type. To switch, create a new category and move the transactions.
- **Estimated monthly** is the starting budget amount for the category.
- **Plaid categories:** pick the Plaid categories whose transactions should land here, broad (Food and drink) or detailed (Food and drink › Groceries). A detailed one beats a broad one.
- **Starter categories:** an empty Categories page offers 25 common categories with Plaid categories already picked.
- **Paycheck details** (income categories only): enter gross pay per paycheck, pay frequency, and deductions (taxes, pre-tax, and post-tax). Telos works out net pay and the monthly estimate.
- **Deductions linked to an account** (for example, a 401(k) contribution) automatically create a matching transfer category. It's renamed, updated, or removed whenever you change the deduction. These show under their income category and are marked "Managed by income category".

## Budgets

Pick a month. Lines are grouped into:

| Group | Lines | Actual |
|---|---|---|
| Income | Each active income category | Income received, net of reversals |
| Expenses | Each active expense category | Spending, net of refunds |
| Savings | Each active asset account | Net money moved in by transfers (withdrawals count against it) |
| Debt | Each active liability account | Payments into the account |

Type a planned amount and it saves on its own a moment later. A category line you haven't set yet shows the category's monthly estimate, and the totals count it; an account line shows 0. Edits in two browser tabs don't overwrite each other.

- **Copy last month** sets every line to the amount it showed last month, estimates included.
- **Fill from estimates** sets every income and expense line to its category's monthly estimate. Savings and debt lines stay as they are.
- Both ask first, and save like typed amounts.

**Uncategorized** (the last Expenses line) is money out this month that's still in Needs Review, so the actuals add up to your cash flow. It has no planned amount; its link opens Transactions.

If any money this month landed on archived categories, a warning above the lines says how much. It isn't in the line totals.

## Transactions

- **Search and filter** by text, date range, status (pending or posted), flow (in or out), amount, and account. The **Needs Review** tab shows only what's waiting for a category, with its count.
- **Categorize** a transaction by typing or picking in its category box, which groups expenses, income, and transfers. Clear the box to send it back to Needs Review.
- **Select** transactions with their checkboxes (the header box selects the page, then **Select all** takes every match) to set a category, hide or unhide them, or **Create rule** from them. A rule from a selection starts with their shared merchant and category. A transfer category is skipped on its own account.
- **Details:** click a transaction's name, or its ••• button, to open its details: its category and why it has it, your own **Name** for it, **Notes**, **Hide from budgets**, and what the bank sent (description, merchant, authorized date, and Plaid's category). **Create rule** there starts a rule for its merchant.
- **Merchant logos** come from Plaid when it has one; otherwise an icon stands in.
- On a phone, transactions show as cards. Tap one for its details.
- After you categorize one, Telos offers a **rule** for that merchant, and to apply it to past transactions. It doesn't offer if a rule already does that.
- **Suggestions:** when Plaid isn't sure, an uncategorized transaction shows its guess. Click it to accept, or use **Accept all**.
- Under each category, a note says how it was set (by a rule, learned from your picks, or from Plaid), or why an uncategorized transaction is a transfer. Hidden transactions are dimmed.
- **Summary cards** (inflows, outflows, and net) cover the selected account and dates, and leave out transfers between your own accounts and hidden transactions.
- **Sync** pulls new and changed transactions from every bank, and "Syncing…" shows while it runs. **Last Synced** shows the bank synced longest ago, so one stuck bank isn't hidden by the others, with a note under it when a bank is importing or needs attention. If a bank needs reconnecting or fails, a message says so; the other banks still sync.
- Telos loads the last 24 months once per visit, shared by every page. **Load older transactions** adds 12 months at a time.

When a pending transaction posts, it keeps the category, name, hiding, and notes it had while pending. Telos also learns: pick the same category for a merchant twice in a row, and new transactions from it get that category.

## Rules

Rules categorize, rename, or hide new transactions as they sync. A rule matches on any of: the merchant (is, or contains), text in the bank's description, accounts, an amount range, and money in or out. It can set a category, rename the transaction, and hide it from budgets.

- Rules run top to bottom, and only the first one that matches applies. New rules go on top; move them with the arrows.
- Switch a rule off without deleting it, edit it in place, or delete it from its menu.
- **Apply to past transactions** (in a rule's menu, and offered when you create one) shows how many loaded transactions match and would change, then changes them. Categories you chose yourself stay unless you tick the box to include them.

Rules never change a category you chose yourself on their own.

## Settings

Shows the Google account you're signed in with, **Export transactions (CSV)**, which downloads every transaction with its account and category names (money in is positive), and a **Sign Out** button.

## Signing in and out

Telos uses Google sign-in. Every page except the login page needs you to be signed in. If you're already signed in, the login page sends you to the Dashboard.
