# Categorization

How transactions get their categories: from your rules, from merchant memory, from Plaid mappings on your categories, or from you. Also covers transfers between your own accounts and the transfer categories made from paycheck deductions. The engine is `lib/categorization.ts`; it's pure, and the sync job and the browser run the same code.

## Who categorizes what

| When | Who | Where |
|---|---|---|
| A new transaction arrives in a sync | The engine | Server: `categorizeTransaction`, called from `planSync` |
| Plaid updates a transaction that has no category | The engine, again (category and suggestion only) | Server |
| A pending transaction posts | Copies the pending version's category, rename, hiding, and notes | Server: `planSync` |
| You pick a category, or accept a suggestion | You | Browser: `updateTransactionAssignment` in `useTransactions` |
| You set a category on selected transactions | You | Browser: `planBulkCategory`, saved by `applyUpdates` |
| You apply a rule to past transactions | The rule, in the browser | `planRuleApplication`, saved by `applyUpdates` |

Once a transaction has a category, sync never changes it. Each transaction records who set its category in `categorySource`: `user`, `rule`, `merchant`, or `plaid`. Automation never changes a `user` category; applying a rule to past transactions changes one only if you tick the box to include them.

## The engine

For each transaction, the engine tries these in order and stops at the first that gives a category:

| Step | Source | Matches on | `categorySource` |
|---|---|---|---|
| 1 | **Your rules**, top first | The rule's conditions (below). Only the first matching rule applies. | `rule` |
| 2 | **Merchant memory** | The merchant, once you've picked the same category for it twice in a row | `merchant` |
| 3 | **Plaid mappings** on your categories | Plaid's detailed category, then its primary one | `plaid` |
| 4 | **Nothing** | Left for Needs Review | null |

At step 3, only a match Plaid is confident about (`HIGH` or `VERY_HIGH`) assigns the category. A less confident one is saved as `suggestedCategoryId`, and the Transactions page shows it as a suggestion to accept with one click, or all at once.

A category is skipped, and the next step tried, when it's archived, deleted, or a transfer to the transaction's own account. So an archived category never receives new transactions automatically.

The first matching rule's rename and hiding apply even when a later step sets the category. The transaction stores that rule's id in `ruleId`.

The engine reads your categories, rules, and merchant memory once per sync, not once per transaction (`buildRulesContext` in `lib/services/ruleEngine.ts`).

## Rules

A rule has conditions and actions, and lives in `rules/{ruleId}`.

| Condition | Matches when |
|---|---|
| Merchant is | The merchant name (or the bank's description, if there's no merchant name) equals the text, ignoring case, punctuation, and digits |
| Merchant contains | The same, but the text appears anywhere in it |
| Description contains | The text appears in the bank's description or original description (case is ignored, digits count) |
| Accounts | The transaction is in one of them |
| Amount from / to | The amount's size is within the bounds, inclusive |
| Money in or out | The direction matches |

Every condition that's set must hold, and a rule needs at least one. Digits are ignored in merchant matching so that "Zelle payment to John 81234" and "Zelle payment to John 99120" are the same merchant.

| Action | Effect |
|---|---|
| Set category | Assigns the category, unless it's archived, deleted, or a transfer to the transaction's own account |
| Rename to | Sets `customName`, which shows instead of the merchant |
| Hide from budgets | Sets `hidden`: left out of budgets, cash flow, and Needs Review, but still listed |

**Order.** Rules run top to bottom (lowest `priority` first). A new rule goes at the top. Move rules with the arrows on the Rules page; that renumbers them 0, 1, 2, and so on.

**Creating one.** On the Rules page, or from the prompt after you categorize a transaction ("Always categorize this way?"), which makes a "Merchant is" rule. The prompt doesn't appear if an enabled rule already gives that merchant that category.

**Apply to past.** New rules apply to new transactions as they sync. To apply one to transactions you already have, use the prompt's checkbox, or Apply to past transactions on the Rules page (offered right after you create a rule that matches anything). It works on the loaded transactions (the last 24 months), shows how many match and would change, and leaves your own picks alone unless you include them. Renames and hiding apply to every match.

## Merchant memory

`merchantMemory/{key}` holds the category you last picked for a merchant and how many times in a row (`streak`). When you pick a category yourself, the browser adds one to the streak, or starts it again at 1 if the category changed. From a streak of 2, new transactions from that merchant get the category.

The key is `m_` plus Plaid's merchant id when there is one, otherwise `n_` plus the merchant name without punctuation or digits (`merchantKey`). Picking a transfer category never updates memory, and neither do Accept all and setting a category on selected transactions.

## Plaid mappings

Each category can list Plaid categories in `plaidCategories`, primary (`FOOD_AND_DRINK`) or detailed (`FOOD_AND_DRINK_GROCERIES`). Pick them in the category form; the list of codes is `lib/plaidCategories.ts`, generated from Plaid's taxonomy. A detailed mapping beats a primary one, so Groceries can take `FOOD_AND_DRINK_GROCERIES` while Restaurants takes the rest of `FOOD_AND_DRINK`. When two categories map the same code, the one listed first wins, and the form shows where a code is already used.

**Starter categories.** An empty Categories page offers 25 common categories with mappings (`lib/starterCategories.ts`), so most transactions are categorized from the first sync. They're ordinary categories once added.

## Transfers between your accounts

`pairTransfers` (`lib/transfers.ts`) finds both legs of a transfer in the loaded transactions:

- Opposite amounts, to the cent, in two different accounts.
- Posted within 5 days of each other.
- At least one leg looks like a transfer: Plaid labels it a transfer, a card or loan payment, or a loan disbursement, or you categorized it as a transfer.
- Neither leg is categorized as income or expense, or hidden. A leg categorized as a transfer pairs only with its destination account.
- Each transaction pairs once, closest dates first.

Pairs are worked out in the browser each time transactions load and aren't stored. A paired transaction (`transferPairId`) counts as a transfer and leaves Needs Review. So do uncategorized card and loan payments. See [Calculations](calculations.md#savings-and-debt-actuals) for how transfers count toward savings and debt.

## Paycheck transfers

An income category can hold paycheck details: gross pay per paycheck, pay frequency, and a list of deductions. See [Calculations](calculations.md#paycheck) for the math.

A deduction that isn't a tax, and is linked to a contribution-eligible account (a 401(k), say), gets its own **transfer category** automatically. That lets the contribution show as savings on the Budgets page.

Each time you save the income category, `reconcileContributionTransfers` (in `useCategories`) brings these transfer categories in line, in one batch:

| Deduction | Its transfer category |
|---|---|
| New, and linked to an account | Created, and tagged with `sourceIncomeCategoryId` and `sourceDeductionId` |
| Still linked | Updated: name, destination, and monthly amount |
| Removed, or unlinked from its account | Deleted |

These categories are found by their tags, not by name, so renaming a deduction renames its category rather than creating a second one. They show under their income category on the Categories page, and their synced fields can't be edited on their own.

Transactions already categorized as one of these transfers keep their `transferAccountId` even after the category is deleted, so savings totals stay correct.

## Rules for a valid assignment

The browser checks these before saving, and the Firestore rules enforce them:

- A category kind needs a category id, and a category id needs a kind.
- A transfer needs a destination account, and it can't be the account the transaction came from.
- Clearing an assignment sets all three fields to null.
- `customName` is at most 120 characters, `notes` at most 1,000, `hidden` is true or false, and `categorySource` is one of the four values.

## Plaid's category version

Every sync asks for version 2 of Plaid's personal finance categories, so the codes Telos stores and maps don't change underneath it. Version 2 adds codes version 1 lacks, such as `LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT` and `TRANSFER_IN_WIRE`.
