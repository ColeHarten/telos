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

  // Common
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;

  startingBalance?: number;
  currentBalance?: number;

  isManual: boolean;
  isArchived: boolean;

  // Plaid fields (null for manual accounts)
  plaidAccountId?: string | null;
  plaidItemId?: string | null;
  plaidMask?: string | null;

  // Metadata
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
  keywords?: string[];
  plaidCategories?: string[];
  transferAccountId?: string | null;

  // --- Paycheck fields (only meaningful when kind === "income") ---
  paycheckDetails?: PaycheckDetails | null;
};

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type DeductionKind = "percentOfGross" | "flatAmount";
export type DeductionType = "tax" | "preTaxDeduction" | "postTaxDeduction";

export interface Deduction {
  label: string;
  value: number;
  kind: DeductionKind;
  type: DeductionType;
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
  originAccId: string;   // the account that the transaction originated from (e.g. a checking account)
  originAccName: string; // the name of the account that the transaction originated from (e.g. a checking account)
  displayName: string;
  amount: number;
  date: string;
  pending: boolean;

  plaidCategoryPrimary: string | null;
  plaidCategoryDetailed: string | null;

  categoryKind: CategoryKind | undefined;
  categoryId: string | undefined;
};

export type Automation = {
  id: string; // normalized merchant key, doubles as the Firestore doc id
  merchantKey: string;
  merchantLabel: string; // original, un-normalized merchant text — display only
  categoryId: string;
  createdAt?: unknown;
};