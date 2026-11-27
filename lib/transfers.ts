import type { Transaction } from "@/lib/types/types";

/**
 * Finds the two legs of transfers between your own accounts, so both are
 * marked as a transfer and counted once. Computed in the browser from the
 * loaded transactions; nothing is stored. Pure, so it is unit tested.
 */

/** How many days apart the two legs of one transfer may post. */
export const PAIR_WINDOW_DAYS = 5;

/** Plaid primaries that mean money moving between accounts: transfers, and card and loan payments. */
export const TRANSFER_PRIMARIES: readonly string[] = ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS", "LOAN_DISBURSEMENTS"];

const LOAN_PRIMARIES: readonly string[] = ["LOAN_PAYMENTS", "LOAN_DISBURSEMENTS"];

type PlaidLabels = Pick<Transaction, "plaidCategoryPrimary" | "plaidCategoryDetailed">;

function hasPrimary(tx: PlaidLabels, primaries: readonly string[]): boolean {
  const primary = tx.plaidCategoryPrimary ?? "";
  const detailed = tx.plaidCategoryDetailed ?? "";
  return primaries.some((p) => primary === p || detailed.startsWith(`${p}_`));
}

/** Plaid labels it a transfer, or a card or loan payment. */
export function hasPlaidTransferLabel(tx: PlaidLabels): boolean {
  return hasPrimary(tx, TRANSFER_PRIMARIES);
}

/** Plaid labels it a card or loan payment (or a loan disbursement). These default to transfers. */
export function isLoanMovement(tx: PlaidLabels): boolean {
  return hasPrimary(tx, LOAN_PRIMARIES);
}

export type PairInput = Pick<
  Transaction,
  | "id"
  | "originAccId"
  | "amount"
  | "date"
  | "categoryKind"
  | "transferAccountId"
  | "plaidCategoryPrimary"
  | "plaidCategoryDetailed"
  | "hidden"
>;

function dayNumber(date: string): number | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

// Uncategorized or already a transfer, and not hidden.
function canPair(tx: PairInput): boolean {
  if (tx.hidden || tx.amount === 0 || tx.originAccId === "unlinked") return false;
  return !tx.categoryKind || tx.categoryKind === "transfer";
}

/**
 * Whether a leg's transfer category allows a partner in partnerAccountId. A
 * leg with no destination, or one pointed at its own account (the receiving
 * side of a payment), can pair with any account.
 */
function pointsAt(tx: PairInput, partnerAccountId: string): boolean {
  if (!tx.transferAccountId || tx.transferAccountId === tx.originAccId) return true;
  return tx.transferAccountId === partnerAccountId;
}

function looksLikeTransfer(tx: PairInput): boolean {
  return tx.categoryKind === "transfer" || hasPlaidTransferLabel(tx);
}

/**
 * Pairs opposite amounts in two different accounts that post within
 * PAIR_WINDOW_DAYS of each other, when at least one leg looks like a
 * transfer (Plaid's label or your transfer category). A leg categorized as a
 * transfer only pairs with its destination account. Each transaction pairs
 * at most once, the closest dates first. Returns each paired transaction's
 * partner id.
 */
export function pairTransfers(transactions: readonly PairInput[]): Map<string, string> {
  const candidates = transactions
    .filter(canPair)
    .map((tx) => ({ tx, day: dayNumber(tx.date), cents: Math.round(tx.amount * 100) }))
    .filter((c): c is { tx: PairInput; day: number; cents: number } => c.day !== null)
    .sort((a, b) => a.day - b.day || a.tx.id.localeCompare(b.tx.id));

  const byCents = new Map<number, typeof candidates>();
  for (const candidate of candidates) {
    const list = byCents.get(candidate.cents);
    if (list) list.push(candidate);
    else byCents.set(candidate.cents, [candidate]);
  }

  const pairs = new Map<string, string>();
  for (const leg of candidates) {
    if (pairs.has(leg.tx.id)) continue;
    let best: (typeof candidates)[number] | null = null;
    let bestGap = Infinity;
    for (const other of byCents.get(-leg.cents) ?? []) {
      if (pairs.has(other.tx.id) || other.tx.originAccId === leg.tx.originAccId) continue;
      if (!looksLikeTransfer(leg.tx) && !looksLikeTransfer(other.tx)) continue;
      if (!pointsAt(leg.tx, other.tx.originAccId) || !pointsAt(other.tx, leg.tx.originAccId)) continue;
      const gap = Math.abs(leg.day - other.day);
      if (gap > PAIR_WINDOW_DAYS || gap >= bestGap) continue;
      best = other;
      bestGap = gap;
    }
    if (best) {
      pairs.set(leg.tx.id, best.tx.id);
      pairs.set(best.tx.id, leg.tx.id);
    }
  }
  return pairs;
}
