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
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type CategoryKind = "income" | "expense" | "transfer";

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
  defaultBudgetMonth: DefaultBudgetMonth;
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
};

export type Automation = {
  id: string; // normalized merchant key, doubles as the Firestore doc id
  merchantKey: string;
  merchantLabel: string; // original, un-normalized merchant text — display only
  categoryId: string;
  createdAt?: unknown;
};

// Aggregated Tier 2 learning signal. One doc per Plaid `detailed` category
// code, scoped to a user (users/{uid}/categoryPlaidStats/{plaidDetailedCode}).
// `counts` maps categoryId -> number of manual corrections that landed on
// that category for this Plaid code. Read once per sync run in
// buildRulesContext, incremented once per manual correction in
// useTransactions.ts.
export type CategoryPlaidStats = {
  counts: Record<string, number>;
  updatedAt?: unknown;
};