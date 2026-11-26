const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Dollars and cents, such as "$1,234.50" or "-$12.00". Telos's one currency format. */
export function formatCurrency(value: number) {
  // Adding 0 turns -0 into 0, so zero never shows as "-$0.00".
  return currency.format(value + 0);
}

/**
 * A transaction's amount with its direction: "+$1,200.00" for money in and
 * "-$45.00" for money out. Plaid amounts are positive for money out.
 */
export function formatTransactionAmount(amount: number) {
  if (amount > 0) return `-${formatCurrency(amount)}`;
  if (amount < 0) return `+${formatCurrency(-amount)}`;
  return formatCurrency(0);
}

/** A total that can go either way, such as net cash flow: "+$120.00", "-$45.00", or "$0.00". */
export function formatSignedCurrency(value: number) {
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
}
