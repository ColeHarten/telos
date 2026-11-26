# Categorization

How transactions get their categories: by you, by your automations, or by what Telos has learned from your choices. Also covers the transfer categories made from paycheck deductions.

## Who categorizes what

| When | Who | Where |
|---|---|---|
| A new transaction arrives in a sync | The rules engine | Server: `applyRules` in `lib/services/ruleEngine.ts` |
| An uncategorized transaction is updated by Plaid | The rules engine, again | Server |
| A pending transaction posts | Copies the pending version's category | Server: `planSync` |
| You pick a category | You | Browser: `updateTransactionAssignment` in `useTransactions` |

Rules only fill in **empty** categories. Once a transaction has a category, sync never changes it. Only you can.

## The rules engine

For each transaction that needs a category, the engine tries these in order and stops at the first match:

| Step | Source | Matches on |
|---|---|---|
| 1 | **Automation** | The merchant key, from `merchantName`, or `rawName` if there's no merchant name |
| 2 | **Learned default** | Plaid's detailed category code, such as `FOOD_AND_DRINK_COFFEE` |
| 3 | **None** | Left uncategorized, so it shows in Needs Review |

If a step points at a category that has been deleted or archived, it's skipped and the next step runs. An archived category never receives new transactions automatically.

When the matched category is a transfer category, the transaction also gets that category's destination account in `transferAccountId`.

The engine reads your categories, automations, and learning votes once per sync, not once per transaction (`buildRulesContext`).

## Automations

An automation says "every transaction from this merchant goes to this category".

- **Creating one:** after you categorize a transaction by hand, the Transactions page offers to create an automation for that merchant.
- **One per merchant:** the doc id is the merchant key, so a new automation for the same merchant replaces the old one.
- **Managing them:** the Automations page lists, searches, and deletes them.
- **Scope:** they apply to new transactions in later syncs, and to uncategorized transactions Plaid updates. They don't change transactions that already have a category.

### Merchant keys

`normalizeMerchant` (`lib/merchant.ts`) turns merchant text into a key: lowercase, letters, digits, and spaces only, with runs of spaces collapsed. For example, "Blue Bottle Coffee #12" becomes `blue bottle coffee 12`.

The browser uses it when creating an automation, and the server uses it when matching. Both import the same function. If they ever normalized differently, automations would silently stop matching, which is why there's a unit test for it.

## Learned defaults

Telos learns from your corrections, per Plaid category code.

**Voting.** When you set a category that differs from the old one, on a transaction that has a Plaid detailed code, the browser adds one vote:

```
categoryPlaidStats/{detailedCode}.counts.{categoryId} += 1
```

Clearing a category, or picking the same one again, doesn't vote. A failed vote never blocks the categorization itself.

**Deciding.** `resolveWinner` picks a category for a code only when both are true:

- The top category has **at least 3 votes**.
- It leads the runner-up by **at least 2 votes**.

So 3 to 0 wins, 4 to 2 wins, and 4 to 3 doesn't. This stops one odd transaction from taking over a whole code.

**Old votes.** An earlier version wrote votes as literal field names like `counts.abc123` instead of inside the `counts` map, so the server never saw them. `readVotes` reads both forms, so those old votes still count.

**Cleanup.** Hard-deleting a category removes its votes from every `categoryPlaidStats` doc.

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

The browser checks these before saving, and the Firestore rules limit which fields it can change:

- A category kind needs a category id, and a category id needs a kind.
- A transfer needs a destination account, and it can't be the account the transaction came from.
- Clearing an assignment sets all three fields to null.

## Plaid's category version

Every sync asks for version 2 of Plaid's personal finance categories, so the codes Telos stores and learns from don't change underneath it. Version 2 adds codes version 1 lacks, such as `LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT` and `TRANSFER_IN_WIRE`.
