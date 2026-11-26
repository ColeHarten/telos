/**
 * The starter categories offered on an empty Categories page, each mapped to
 * Plaid categories so most transactions are categorized from the first sync.
 * Everything here is editable after it's added. Transfer categories need a
 * destination account, so none are included; paired transfers and card and
 * loan payments are recognized without one.
 */

export type StarterCategory = {
  name: string;
  kind: "income" | "expense";
  plaidCategories: string[];
};

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  { name: "Paychecks", kind: "income", plaidCategories: ["INCOME_SALARY", "INCOME_MILITARY"] },
  { name: "Interest and dividends", kind: "income", plaidCategories: ["INCOME_INTEREST_EARNED", "INCOME_DIVIDENDS"] },
  { name: "Other income", kind: "income", plaidCategories: ["INCOME"] },
  { name: "Groceries", kind: "expense", plaidCategories: ["FOOD_AND_DRINK_GROCERIES"] },
  { name: "Coffee shops", kind: "expense", plaidCategories: ["FOOD_AND_DRINK_COFFEE"] },
  { name: "Restaurants and bars", kind: "expense", plaidCategories: ["FOOD_AND_DRINK"] },
  { name: "Shopping", kind: "expense", plaidCategories: ["GENERAL_MERCHANDISE"] },
  { name: "Pets", kind: "expense", plaidCategories: ["GENERAL_MERCHANDISE_PET_SUPPLIES", "MEDICAL_VETERINARY_SERVICES"] },
  { name: "Rent", kind: "expense", plaidCategories: ["RENT_AND_UTILITIES_RENT"] },
  { name: "Utilities", kind: "expense", plaidCategories: ["RENT_AND_UTILITIES"] },
  { name: "Home", kind: "expense", plaidCategories: ["HOME_IMPROVEMENT"] },
  { name: "Gas", kind: "expense", plaidCategories: ["TRANSPORTATION_GAS"] },
  { name: "Auto and transport", kind: "expense", plaidCategories: ["TRANSPORTATION"] },
  { name: "Travel", kind: "expense", plaidCategories: ["TRAVEL"] },
  { name: "Medical", kind: "expense", plaidCategories: ["MEDICAL"] },
  { name: "Fitness", kind: "expense", plaidCategories: ["PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"] },
  { name: "Personal care", kind: "expense", plaidCategories: ["PERSONAL_CARE"] },
  { name: "Entertainment", kind: "expense", plaidCategories: ["ENTERTAINMENT"] },
  { name: "Insurance", kind: "expense", plaidCategories: ["GENERAL_SERVICES_INSURANCE"] },
  { name: "Education", kind: "expense", plaidCategories: ["GENERAL_SERVICES_EDUCATION"] },
  { name: "Childcare", kind: "expense", plaidCategories: ["GENERAL_SERVICES_CHILDCARE"] },
  { name: "Services", kind: "expense", plaidCategories: ["GENERAL_SERVICES"] },
  { name: "Gifts and donations", kind: "expense", plaidCategories: ["GOVERNMENT_AND_NON_PROFIT_DONATIONS"] },
  { name: "Taxes and government", kind: "expense", plaidCategories: ["GOVERNMENT_AND_NON_PROFIT"] },
  { name: "Bank fees", kind: "expense", plaidCategories: ["BANK_FEES"] },
];

/** The starters whose names aren't taken yet (ignoring case). */
export function missingStarterCategories(existingNames: readonly string[]): StarterCategory[] {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  return STARTER_CATEGORIES.filter((starter) => !taken.has(starter.name.toLowerCase()));
}
