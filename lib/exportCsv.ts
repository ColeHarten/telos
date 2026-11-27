/**
 * The CSV behind Export transactions in Settings. Pure, so it's tested
 * without a browser.
 */

export type ExportTransaction = {
  id: string;
  date: string;
  accountId: string;
  description: string;
  merchant: string;
  originalDescription: string;
  /** Plaid's sign: positive is money out. */
  amount: number;
  categoryId: string | null;
  categoryKind: string | null;
  plaidCategory: string;
  pending: boolean;
};

export type CsvCell = string | number | boolean | null;

export const CSV_HEADER: CsvCell[] = [
  "Date",
  "Account",
  "Description",
  "Merchant",
  "Original description",
  "Amount",
  "Category",
  "Category type",
  "Bank category",
  "Pending",
  "Transaction ID",
];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A transaction doc as exported, or null for one Plaid has removed. */
export function toExportTransaction(id: string, data: Record<string, unknown>): ExportTransaction | null {
  if (data.removedByPlaid === true) return null;
  const category = (data.category ?? null) as { primary?: unknown; detailed?: unknown } | null;
  return {
    id,
    date: text(data.date),
    accountId: text(data.accountId),
    description: text(data.merchantName) || text(data.rawName),
    merchant: text(data.merchantName),
    originalDescription: text(data.originalDescription) || text(data.rawName),
    amount: typeof data.amount === "number" && Number.isFinite(data.amount) ? data.amount : 0,
    categoryId: typeof data.categoryId === "string" && data.categoryId ? data.categoryId : null,
    categoryKind: typeof data.categoryKind === "string" && data.categoryKind ? data.categoryKind : null,
    plaidCategory: text(category?.detailed) || text(category?.primary),
    pending: data.pending === true,
  };
}

/**
 * One CSV cell. Text is always quoted, and text that starts like a formula
 * gets a leading apostrophe so spreadsheet apps show it instead of running it.
 */
export function csvCell(value: CsvCell): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.split('"').join('""')}"`;
}

/** Newest first. Amounts are flipped so money in is positive, as in most bank exports. */
export function buildTransactionsCsv(
  transactions: ExportTransaction[],
  names: { accounts: Map<string, string>; categories: Map<string, string> }
): string {
  const rows = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const table: CsvCell[][] = [
    CSV_HEADER,
    ...rows.map((tx): CsvCell[] => [
      tx.date,
      names.accounts.get(tx.accountId) ?? "",
      tx.description,
      tx.merchant,
      tx.originalDescription,
      tx.amount === 0 ? 0 : -tx.amount,
      tx.categoryId ? names.categories.get(tx.categoryId) ?? "" : "",
      tx.categoryKind ?? "",
      tx.plaidCategory,
      tx.pending,
      tx.id,
    ]),
  ];
  return table.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
