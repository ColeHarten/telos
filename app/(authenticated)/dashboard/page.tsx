"use client";

import { MonthPickerControl, formatMonthLabel, getCurrentMonthKey, shiftMonthKey } from "@/components/MonthPickerControl";
import useBudgetingData from "@/lib/useBudgetingData";
import useAuth from "@/lib/hooks/useAuth";
import useCashflows from "@/lib/hooks/useCashflows";
import useAccounts from "@/lib/hooks/useAccounts";
import useBudget from "@/lib/hooks/useBudget";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import DateRangeRoundedIcon from "@mui/icons-material/DateRangeRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  IconButton,
  Snackbar,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

type BudgetLineLike = {
  id: string;
  lineType: "cashflow" | "account_transfer";
  planned: number;
  cashflowId?: string;
  toAccountId?: string;
};

function formatShortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function getPercentage(value: number, denominator: number) {
  if (denominator <= 0) {
    return "0.0%";
  }

  return `${((value / denominator) * 100).toFixed(1)}%`;
}

// Every "YYYY-MM" key from start to end, inclusive. Used to render a
// chart/summary row for months with no saved budget too, instead of
// silently skipping gaps.
function enumerateMonthKeys(startMonthKey: string, endMonthKey: string) {
  const keys: string[] = [];
  let cursor = startMonthKey;
  let guard = 0;

  // Guard against an inverted or absurd range producing an infinite loop.
  while (cursor <= endMonthKey && guard < 240) {
    keys.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
    guard += 1;
  }

  return keys;
}

// Number of months spanned by [start, end], inclusive. A single month has
// width 1. Used so the prev/next chevrons can shift the whole range by its
// own width and preserve how many months are selected.
function rangeWidthInMonths(startMonthKey: string, endMonthKey: string) {
  const [startYear, startMonth] = startMonthKey.split("-").map(Number);
  const [endYear, endMonth] = endMonthKey.split("-").map(Number);

  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
}

function summarizeBudgetLines(
  lines: Record<string, BudgetLineLike>,
  cashflowsById: Map<string, { kind: string; name: string }>,
  accountsById: Map<string, { normalBalance: string }>
) {
  let income = 0;
  let expenses = 0;
  let savings = 0;
  let debt = 0;
  const expenseRows: { id: string; label: string; value: number }[] = [];

  for (const line of Object.values(lines ?? {})) {
    const planned = Number(line.planned ?? 0);

    if (line.lineType === "cashflow" && line.cashflowId) {
      const cashflow = cashflowsById.get(line.cashflowId);
      if (!cashflow) continue;

      if (cashflow.kind === "income") {
        income += planned;
      }

      if (cashflow.kind === "expense") {
        expenses += planned;
        if (planned > 0) {
          expenseRows.push({ id: line.id, label: cashflow.name, value: planned });
        }
      }
    }

    if (line.lineType === "account_transfer" && line.toAccountId) {
      const account = accountsById.get(line.toAccountId);
      if (!account) continue;

      if (account.normalBalance === "asset") {
        savings += planned;
      }

      if (account.normalBalance === "liability") {
        debt += planned;
      }
    }
  }

  return { income, expenses, savings, debt, expenseRows };
}

export default function DashboardPage() {
  const { user, authLoading } = useAuth();
  const { cashflows } = useCashflows(user, authLoading);
  const { accounts } = useAccounts(user, authLoading);
  const { rangeBudgets, rangeLoading, rangeError, loadBudgetRange, error } = useBudget(user, authLoading);

  // The dashboard now has a single concept: a month range. A "single month"
  // view is just the case where rangeStart === rangeEnd, so there's one
  // state machine and one rendering path instead of two.
  const [rangeStart, setRangeStart] = useState<string>(() => getCurrentMonthKey());
  const [rangeEnd, setRangeEnd] = useState<string>(() => getCurrentMonthKey());
  const [rangeOrderWarning, setRangeOrderWarning] = useState<string | null>(null);

  const isSingleMonth = rangeStart === rangeEnd;

  const cashflowsById = useMemo(() => {
    return new Map(cashflows.map((cashflow) => [cashflow.id, cashflow]));
  }, [cashflows]);

  const accountsById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  // Fetch whenever the range bounds change. Waits for auth to resolve first
  // (loadBudgetRange throws if called before a user is available, which is
  // the case on initial mount while onAuthStateChanged is still pending).
  // Skips the fetch (and shows a warning instead) if the end month is
  // before the start month.
  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    if (rangeEnd < rangeStart) {
      setRangeOrderWarning("End month is before the start month.");
      return;
    }

    setRangeOrderWarning(null);
    loadBudgetRange(rangeStart, rangeEnd).catch(() => {
      // rangeError state already reflects the failure; nothing else to do here.
    });
    // loadBudgetRange closes over `user` but is otherwise stable; omitting it
    // from deps avoids refetching on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, rangeStart, rangeEnd]);

  // Per-month rows, used both for the single-month breakdown (just rows[0])
  // and the multi-month trend chart, plus totals summed across the range.
  const rangeData = useMemo(() => {
    const monthKeys = enumerateMonthKeys(rangeStart, rangeEnd);

    const rows = monthKeys.map((key) => {
      const lines = rangeBudgets[key] as Record<string, BudgetLineLike> | undefined;
      const { income, expenses, savings, debt, expenseRows } = summarizeBudgetLines(
        lines ?? {},
        cashflowsById,
        accountsById
      );

      return {
        monthKey: key,
        label: formatShortMonthLabel(key),
        income,
        expenses,
        savings,
        debt,
        remaining: income - expenses - savings - debt,
        expenseRows,
      };
    });

    const totals = rows.reduce(
      (acc, row) => ({
        income: acc.income + row.income,
        expenses: acc.expenses + row.expenses,
        savings: acc.savings + row.savings,
        debt: acc.debt + row.debt,
      }),
      { income: 0, expenses: 0, savings: 0, debt: 0 }
    );

    const remaining = totals.income - totals.expenses - totals.savings - totals.debt;
    const totalAllocated =
      totals.expenses + totals.savings + totals.debt + Math.max(remaining, 0);

    const topExpenses = rows
      .flatMap((row) => row.expenseRows)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      rows,
      totals: { ...totals, remaining, totalAllocated },
      topExpenses,
    };
  }, [rangeStart, rangeEnd, rangeBudgets, cashflowsById, accountsById]);

  const breakdown = useMemo(
    () => [
      {
        label: "Expenses",
        value: getPercentage(rangeData.totals.expenses, rangeData.totals.totalAllocated),
        rawValue: rangeData.totals.expenses,
        color: "#ef4444",
      },
      {
        label: "Savings",
        value: getPercentage(rangeData.totals.savings, rangeData.totals.totalAllocated),
        rawValue: rangeData.totals.savings,
        color: "#8b5cf6",
      },
      {
        label: "Debt",
        value: getPercentage(rangeData.totals.debt, rangeData.totals.totalAllocated),
        rawValue: rangeData.totals.debt,
        color: "#f59e0b",
      },
      {
        label: "Remaining",
        value: getPercentage(
          Math.max(rangeData.totals.remaining, 0),
          rangeData.totals.totalAllocated
        ),
        rawValue: Math.max(rangeData.totals.remaining, 0),
        color: "#10b981",
      },
    ],
    [rangeData]
  );

  const conicGradient = useMemo(() => {
    if (rangeData.totals.totalAllocated <= 0) {
      return "conic-gradient(#e5e7eb 0deg 360deg)";
    }

    let currentDegrees = 0;
    const segments = breakdown.map((item) => {
      const degrees = (item.rawValue / rangeData.totals.totalAllocated) * 360;
      const start = currentDegrees;
      const end = currentDegrees + degrees;
      currentDegrees = end;
      return `${item.color} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${segments.join(", ")})`;
  }, [breakdown, rangeData.totals.totalAllocated]);

  const summaryCards = useMemo(
    () => [
      {
        label: isSingleMonth ? "Projected Income" : "Total Income",
        value: formatCurrency(rangeData.totals.income),
        color: "#059669",
      },
      {
        label: isSingleMonth ? "Projected Expenses" : "Total Expenses",
        value: formatCurrency(rangeData.totals.expenses),
        color: "#dc2626",
      },
      {
        label: isSingleMonth ? "Projected Savings" : "Total Savings",
        value: formatCurrency(rangeData.totals.savings),
        color: "#7c3aed",
      },
      {
        label: isSingleMonth ? "Projected Debt Payments" : "Total Debt Payments",
        value: formatCurrency(rangeData.totals.debt),
        color: "#ea580c",
      },
      {
        label: isSingleMonth ? "Projected Remaining Cash Flow" : "Net Over Range",
        value: formatCurrency(rangeData.totals.remaining),
        color: rangeData.totals.remaining >= 0 ? "#059669" : "#dc2626",
      },
    ],
    [isSingleMonth, rangeData]
  );

  // Sets the end month to exactly 12 months after the current start month.
  function extendToTwelveMonths() {
    setRangeEnd(shiftMonthKey(rangeStart, 11));
  }

  function handleStartChange(nextStart: string) {
    setRangeStart(nextStart);
  }

  function handleEndChange(nextEnd: string) {
    setRangeEnd(nextEnd);
  }

  const rangeWidth = rangeWidthInMonths(rangeStart, rangeEnd);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      {error && (
        <Snackbar
          open={error !== null}
          autoHideDuration={5000}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Alert
            severity="error"
            variant="filled"
            sx={{
              borderRadius: "8px",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
              fontWeight: 600,
            }}
          >
            {error}
          </Alert>
        </Snackbar>
      )}

      {rangeError && (
        <Snackbar
          open={rangeError !== null}
          autoHideDuration={5000}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Alert
            severity="error"
            variant="filled"
            sx={{
              borderRadius: "8px",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
              fontWeight: 600,
            }}
          >
            {rangeError}
          </Alert>
        </Snackbar>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          alignItems: { xs: "flex-start", lg: "center" },
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Overview
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <MonthPickerControl
            monthKey={rangeStart}
            onChange={handleStartChange}
            showStepButtons={false}
            ariaLabelPrefix="Range start: "
          />

          <Typography variant="body2" color="text.secondary">
            to
          </Typography>

          <MonthPickerControl
            monthKey={rangeEnd}
            onChange={handleEndChange}
            showStepButtons={false}
            ariaLabelPrefix="Range end: "
          />

          <IconButton
            onClick={extendToTwelveMonths}
            aria-label="Set end month to 12 months after start"
            title="Next 12 months"
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px",
              height: "40px",
              width: "40px",
            }}
          >
            <DateRangeRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Box>

      {rangeOrderWarning && (
        <Alert severity="warning" sx={{ borderRadius: "8px" }}>
          {rangeOrderWarning}
        </Alert>
      )}

      {rangeLoading ? (
        <Card
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "12px",
            bgcolor: "background.paper",
          }}
        >
          <CardContent sx={{ p: "20px" }}>
            <Typography variant="body2" color="text.secondary">
              Loading...
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Grid container spacing="16px">
            {summaryCards.map((card) => (
              <Grid
                key={card.label}
                size={{
                  xs: 12,
                  sm: 6,
                  md: card.label.includes("Remaining") || card.label.includes("Net") ? 6 : 4,
                }}
              >
                <Card
                  elevation={0}
                  sx={{
                    height: "100%",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "12px",
                    bgcolor: "background.paper",
                  }}
                >
                  <CardContent sx={{ p: "20px" }}>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontWeight: 600 }}
                      >
                        {card.label}
                      </Typography>

                      <Typography
                        variant="h4"
                        sx={{
                          color: card.color,
                          fontWeight: 800,
                          letterSpacing: "-0.04em",
                        }}
                      >
                        {card.value}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {isSingleMonth ? (
            <Grid container spacing="16px">
              <Grid size={{ xs: 12, md: 7 }}>
                <Card
                  elevation={0}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "12px",
                    bgcolor: "background.paper",
                    height: "100%",
                  }}
                >
                  <CardContent sx={{ p: "20px" }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Budget Breakdown
                    </Typography>

                    <Typography
                      color="text.secondary"
                      variant="body2"
                      sx={{ mt: "4px" }}
                    >
                      Planned allocation across your month.
                    </Typography>

                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "20px",
                        mt: "24px",
                        flexDirection: { xs: "column", sm: "row" },
                      }}
                    >
                      <Box
                        sx={{
                          width: "150px",
                          height: "150px",
                          borderRadius: "50%",
                          background: conicGradient,
                          position: "relative",
                          flexShrink: 0,
                        }}
                      >
                        <Box
                          sx={{
                            position: "absolute",
                            inset: "32px",
                            borderRadius: "50%",
                            bgcolor: "background.paper",
                          }}
                        />
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          width: "100%",
                        }}
                      >
                        {breakdown.map((item) => (
                          <Box
                            key={item.label}
                            sx={{
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: "10px",
                              }}
                            >
                              <Box
                                sx={{
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "50%",
                                  bgcolor: item.color,
                                }}
                              />

                              <Typography variant="body2">{item.label}</Typography>
                            </Box>

                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {item.value}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 5 }}>
                <Card
                  elevation={0}
                  sx={{
                    height: "100%",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "12px",
                    bgcolor: "background.paper",
                  }}
                >
                  <CardContent sx={{ p: "24px" }}>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Top Planned Expenses
                      </Typography>

                      <Divider />

                      {rangeData.topExpenses.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No planned expenses yet. Add expense amounts in Budgets.
                        </Typography>
                      ) : (
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          {rangeData.topExpenses.map((expense) => (
                            <Box
                              key={expense.id}
                              sx={{
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: "10px",
                                  minWidth: 0,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "8px",
                                    bgcolor: "#f8fafc",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                >
                                  <TrendingDownRoundedIcon sx={{ fontSize: 18 }} />
                                </Box>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {expense.label}
                                </Typography>
                              </Box>

                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatCurrency(expense.value)}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : (
            <Card
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "12px",
                bgcolor: "background.paper",
              }}
            >
              <CardContent sx={{ p: "20px" }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Monthly Trend
                </Typography>

                <Typography color="text.secondary" variant="body2" sx={{ mt: "4px" }}>
                  Income, expenses, savings, and debt across {formatMonthLabel(rangeStart)}
                  {" \u2013 "}
                  {formatMonthLabel(rangeEnd)} ({rangeWidth} months).
                </Typography>

                <Box sx={{ width: "100%", height: "320px", mt: "16px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rangeData.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(Number(value))}
                        width={80}
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                      />
                      <Legend />
                      <Bar dataKey="income" name="Income" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="savings" name="Savings" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="debt" name="Debt" fill="#ea580c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}