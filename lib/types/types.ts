export type AccountType =
  | "cash"
  | "credit_card"
  | "investment"
  | "retirement"
  | "loan"
  | "property"
  | "crypto"
  | "other_asset"
  | "other_liability";

export type NormalBalance = "asset" | "liability";

export type AuthUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

export type Account = {
  id: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  startingBalance?: number;
  currentBalance?: number;
  isManual: boolean;
  isArchived: boolean;
  isContributionEligible: boolean;
  plaidAccountId?: string | null;
  plaidItemId?: string | null;
  plaidMask?: string | null;
  // Denormalized from the plaidItem so exchange-token can dedupe new links
  // against existing accounts without an extra join. Manual accounts write
  // this as null (see useAccounts.addManualAccount).
  plaidInstitutionId?: string | null;
  /** The bank stopped sharing this account (Manage accounts, or closed at the bank). It keeps its history. */
  plaidClosed?: boolean;
  /** When the server last wrote this account's balance from Plaid, in epoch milliseconds. */
  balanceUpdatedAt?: number | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/** How much of a bank's history Plaid has delivered (its transactions_update_status). */
export type PlaidImportStatus = "not_ready" | "initial" | "historical" | "unknown";

/** A bank connection as the browser sees it, from its plaidItemStatus doc. */
export type PlaidConnection = {
  itemId: string;
  institutionName: string | null;
  plaidEnv: "sandbox" | "production";
  needsReauth: boolean;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  lastSyncErrorAt: Date | null;
  importStatus: PlaidImportStatus;
  /** The last sync stopped part way; the next one continues. */
  hasMore: boolean;
  linkedAt: number | null;
  consentExpiresAt: Date | null;
  refreshRequestedAt: number | null;
  rebuildRequestedAt: number | null;
};

export type CategoryKind = "income" | "expense" | "transfer";

/** Who set a transaction's category: you, a rule, merchant memory, or a Plaid mapping. */
export type CategorySource = "user" | "rule" | "merchant" | "plaid";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  estimatedMonthly: number; // for income with paycheckDetails, this is always the computed net
  sortOrder: number;
  isDefault?: boolean;
  isArchived: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;

  groupId?: string | null;
  description?: string;
  plaidCategories?: string[];
  transferAccountId?: string | null;

  // Set only on transfer categories auto-created from a paycheck deduction
  // link. Lets the reconciliation logic find "the transfer category I made
  // for this deduction last time" instead of matching on name/amount.
  // Both null for any category not created this way.
  sourceIncomeCategoryId?: string | null;
  sourceDeductionId?: string | null;

  // --- Paycheck fields (only meaningful when kind === "income") ---
  paycheckDetails?: PaycheckDetails | null;
};

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type DeductionKind = "percentOfGross" | "flatAmount";
export type DeductionType = "tax" | "preTaxDeduction" | "postTaxDeduction";

export interface Deduction {
  id: string; // stable client-generated key (crypto.randomUUID()) — lets the
  // reconciliation logic track a deduction row across edits/renames
  label: string;
  value: number;
  kind: DeductionKind;
  type: DeductionType;
  // Only meaningful when type is preTaxDeduction/postTaxDeduction — a "tax"
  // deduction is withheld, not contributed anywhere. Each contribution-
  // eligible account may be linked from at most one deduction row (1:1).
  linkedAccountId?: string | null;
}

export interface PaycheckDetails {
  payFrequency: PayFrequency;
  grossSalary: number; // per-paycheck gross, not monthly
  deductions: Deduction[];
}

export type BudgetLine = {
  id: string;
  lineType: CategoryKind;
  categoryId: string;
  planned: number;
  notes?: string;
};

export type BudgetLines = Record<string, BudgetLine>;

export type Currency = "USD";
export type DefaultBudgetMonth = "current" | "next";

export type AppSettings = {
  currency: Currency;
  createdAt?: unknown;
  updatedAt?: unknown;
};


export type Transaction = {
  id: string;
  originAccId: string;
  originAccName: string;
  displayName: string;
  amount: number;
  date: string;
  pending: boolean;

  plaidCategoryPrimary: string | null;
  plaidCategoryDetailed: string | null;

  categoryKind: CategoryKind | undefined;
  categoryId: string | undefined;

  // Only meaningful when categoryKind === "transfer". The destination
  // account id resolved from the matched Category's transferAccountId at
  // assignment time, denormalized onto the transaction so it keeps
  // working even if the source Category is later hard-deleted (see
  // reconcileContributionTransfers in useCategories.ts). null otherwise.
  transferAccountId: string | null;

  // Optional so test fixtures can leave them out; toTransaction always sets them.
  merchantName?: string | null;
  merchantEntityId?: string | null;
  /** The bank's description, as Plaid cleaned it. */
  rawName?: string;
  originalDescription?: string | null;
  logoUrl?: string | null;
  plaidConfidence?: string | null;
  categorySource?: CategorySource | null;
  /** The first rule that matched this transaction. */
  ruleId?: string | null;
  /** A less confident Plaid match, waiting in Needs Review for you to accept. */
  suggestedCategoryId?: string | null;
  /** Your name for it, shown instead of the merchant. */
  customName?: string | null;
  /** Left out of budgets, cash flow, and Needs Review. */
  hidden?: boolean;
  notes?: string | null;
  /** When the card was swiped, if the bank reports it (date is when it posted). */
  authorizedDate?: string | null;
  website?: string | null;
  /** The other leg of a transfer between your accounts. Computed in the browser, not stored. */
  transferPairId?: string | null;
};

/** A rule's conditions. Every condition that is set must hold, and a rule needs at least one. */
export type RuleConditions = {
  /** Compared with the merchant name (or the bank's description) without punctuation or digits. */
  merchant: { op: "is" | "contains"; value: string } | null;
  /** Found anywhere in the bank's description. */
  description: string | null;
  /** Empty means any account. */
  accountIds: string[];
  /** Bounds on the amount's size, inclusive. */
  amountMin: number | null;
  amountMax: number | null;
  direction: "in" | "out" | null;
};

export type RuleActions = {
  categoryId: string | null;
  rename: string | null;
  hide: boolean;
};

/** users/{uid}/rules/{ruleId}. Rules run lowest priority number first, and only the first match applies. */
export type Rule = {
  id: string;
  enabled: boolean;
  priority: number;
  conditions: RuleConditions;
  actions: RuleActions;
};

/**
 * users/{uid}/merchantMemory/{key}: the category you last chose for a
 * merchant and how many times in a row. It applies to new transactions once
 * the streak reaches 2. Never written for transfer categories.
 */
export type MerchantMemory = {
  key: string;
  label: string;
  categoryId: string;
  streak: number;
};
