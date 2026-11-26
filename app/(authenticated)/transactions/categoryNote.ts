import { hasPlaidTransferLabel, isLoanMovement } from "@/lib/transfers";
import type { Transaction } from "@/lib/types/types";

/** A short note on how a transaction got its category, or why it needs none. Null for your own picks. */
export function categoryNote(tx: Transaction): string | null {
  if (tx.categoryId) {
    if (tx.categorySource === "rule") return "Set by a rule";
    if (tx.categorySource === "merchant") return "Learned from your picks";
    if (tx.categorySource === "plaid") return "From Plaid's category";
    return null;
  }
  if (tx.hidden) return "Hidden from budgets";
  if (tx.transferPairId) return "Transfer between your accounts";
  if (isLoanMovement(tx)) return "Card or loan payment (a transfer)";
  if (hasPlaidTransferLabel(tx)) return "Plaid calls this a transfer";
  return null;
}
