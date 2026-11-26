/**
 * Normalizes a merchant name or bank description: lowercase, no punctuation,
 * single spaces. The categorization engine builds its rule matching and
 * merchant memory keys from this (see lib/categorization.ts), and the same
 * code runs in the browser and in the sync job, so the two never drift.
 */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}