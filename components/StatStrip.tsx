"use client";

import { Box, Paper, Typography } from "@mui/material";

export type Stat = {
  label: string;
  value: string;
  caption?: string;
  /** Green for money in. Red only when something is wrong, such as overspending. */
  tone?: "positive" | "negative";
};

const TONE_COLOR = { positive: "success.main", negative: "error.main" } as const;

/**
 * A page's headline numbers in one card, split by hairlines: two per row on
 * phones, all in one row from md up. Used on Transactions, Accounts, and Budgets.
 */
export default function StatStrip({ stats }: { stats: Stat[] }) {
  const oddOnPhones = stats.length % 2 === 1;

  return (
    <Paper
      variant="outlined"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: `repeat(${stats.length}, minmax(0, 1fr))` },
        gap: "1px",
        bgcolor: "divider",
        overflow: "hidden",
      }}
    >
      {stats.map((stat, index) => (
        <Box
          key={stat.label}
          sx={{
            bgcolor: "background.paper",
            px: { xs: 2, md: 2.5 },
            py: 2,
            minWidth: 0,
            gridColumn: { xs: oddOnPhones && index === stats.length - 1 ? "span 2" : "auto", md: "auto" },
          }}
        >
          <Typography variant="body2" noWrap sx={{ color: "text.secondary", fontWeight: 500 }}>
            {stat.label}
          </Typography>
          <Typography
            noWrap
            sx={{
              mt: 0.5,
              fontWeight: 700,
              fontSize: { xs: "1.125rem", md: "1.375rem" },
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
              color: stat.tone ? TONE_COLOR[stat.tone] : "text.primary",
            }}
          >
            {stat.value}
          </Typography>
          {stat.caption && (
            <Typography variant="caption" noWrap sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
              {stat.caption}
            </Typography>
          )}
        </Box>
      ))}
    </Paper>
  );
}
