/**
 * Normalizes a merchant / transaction description string into a stable key
 * used both as:
 *   - the matching key when a Plaid transaction is scored against a user's
 *     automations at sync time (see ruleEngine.ts)
 *   - the Firestore document id for an Automation (see useAutomations.ts)
 *
 * Lives outside both the client and server service files so the exact same
 * normalization runs in the browser (when a user creates an automation) and
 * in the Plaid sync job (when a transaction is matched against it). If these
 * two ever drift, automations silently stop matching.
 */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}