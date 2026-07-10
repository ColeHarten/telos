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
  estimatedMonthly: number;
  sortOrder: number;
  isDefault?: boolean;
  isArchived: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;

  // TODO
  groupId?: string | null; // optional grouping of categories, e.g. "food", "transportation", etc.

  // --- Rules engine fields (Phase 1) ---
  description?: string;
  keywords?: string[];            // lowercase, normalized
  plaidCategories?: string[];     // e.g. ["FOOD_AND_DRINK_COFFEE"]

  // --- Transfer-type fields ---
  // Only meaningful when kind === "transfer". Points at the Account this
  // transfer category's money moves into. Required at the UI/validation
  // layer whenever kind is "transfer" (see AddCategoryModal), but kept
  // optional/nullable here since income/expense categories never set it.
  transferAccountId?: string | null;
};

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type DeductionKind = "percentOfGross" | "flatAmount";
export type DeductionWhen = "preTax" | "postTax";

export interface Deduction {
  label: string;
  value: number;
  kind: DeductionKind;
  when: DeductionWhen;
}

export interface PaycheckProfile {
  id: string;
  name: string;
  payFrequency: PayFrequency;
  grossSalary: number;
  linkedIncomeCategoryId: string;
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

export type AssignmentType = "cashflow" | "account_transfer" | "unassigned";

export type Transaction = {
  id: string;
  originAccId: string;   // the account that the transaction originated from (e.g. a checking account)
  originAccName: string; // the name of the account that the transaction originated from (e.g. a checking account)
  displayName: string;
  amount: number;
  date: string;
  pending: boolean;

  categoryPrimary: string | null;
  categoryDetailed: string | null;

  assignmentType: AssignmentType;
  assignmentId: string | undefined;
};

export type Automation = {
  id: string;            // normalized merchant key, doubles as doc id
  merchantKey: string;
  cashflowId: string;
  createdAt?: unknown;
};