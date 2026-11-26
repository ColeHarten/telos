"use client";

import { formatTransactionAmount } from "@/lib/utils";
import { Typography, type SxProps, type Theme } from "@mui/material";

type TransactionAmountProps = {
  /** Plaid's sign: positive is money out. */
  amount: number;
  sx?: SxProps<Theme>;
};

/** "+$1,200.00" in green for money in, "-$45.00" in the text color for money out. */
export default function TransactionAmount({ amount, sx = [] }: TransactionAmountProps) {
  return (
    <Typography
      variant="body2"
      component="span"
      sx={[
        { fontWeight: 600, whiteSpace: "nowrap", color: amount < 0 ? "success.main" : "text.primary" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {formatTransactionAmount(amount)}
    </Typography>
  );
}
