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

export type CashflowKind = "income" | "expense";

export type Cashflow = {
  id: string;
  name: string;
  kind: CashflowKind;
  estimatedMonthly: number;
  sortOrder: number;
  isDefault?: boolean;
  isArchived: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
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

export interface WithholdingProfile {
  id: string; // Used to fetch, update, and match profiles in useBudgetingData
  name: string;
  payFrequency: PayFrequency;
  grossSalary: number;
  linkedIncomeCashflowId: string; // Explicitly maps to Cashflow.id
  deductions: Deduction[];
}

export type BudgetLineType = "cashflow" | "account_transfer";

export type BudgetLine = {
  id: string;
  lineType: BudgetLineType;
  cashflowId?: string;
  toAccountId?: string;
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
