"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Snackbar,
  Typography,
} from "@mui/material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import useBudgetingData from "@/lib/useBudgetingData";
import type {
  CashflowKind,
  Cashflow,
  Account,
  BudgetLine,
  BudgetLines,
} from "@/lib/types";

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function formatMonthLabel(monthKey: string) {
  if (!monthKey) {
    return "Loading month";
  }

  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getPercentage(value: number, denominator: number) {
  if (denominator <= 0) {
    return "0.0%";
  }

  return `${((value / denominator) * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const { selectedMonthKey: monthKey, setSelectedMonthKey: setMonthKey, cashflows, accounts, budgetLines, isLoading, error } = useBudgetingData();

  const cashflowsById = useMemo(() => {
    return new Map(cashflows.map((cashflow) => [cashflow.id, cashflow]));
  }, [cashflows]);

  const accountsById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const dashboardData = useMemo(() => {
    let income = 0;
    let expenses = 0;
    let savings = 0;
    let debt = 0;

    const expenseRows: {
      id: string;
      label: string;
      value: number;
    }[] = [];

    for (const line of Object.values(budgetLines)) {
      const planned = Number(line.planned ?? 0);

      if (line.lineType === "cashflow" && line.cashflowId) {
        const cashflow = cashflowsById.get(line.cashflowId);

        if (!cashflow) {
          continue;
        }

        if (cashflow.kind === "income") {
          income += planned;
        }

        if (cashflow.kind === "expense") {
          expenses += planned;

          if (planned > 0) {
            expenseRows.push({
              id: line.id,
              label: cashflow.name,
              value: planned,
            });
          }
        }
      }

      if (line.lineType === "account_transfer" && line.toAccountId) {
        const account = accountsById.get(line.toAccountId);

        if (!account) {
          continue;
        }

        if (account.normalBalance === "asset") {
          savings += planned;
        }

        if (account.normalBalance === "liability") {
          debt += planned;
        }
      }
    }

    const remaining = income - expenses - savings - debt;
    const totalAllocated = expenses + savings + debt + Math.max(remaining, 0);

    return {
      income,
      expenses,
      savings,
      debt,
      remaining,
      totalAllocated,
      topExpenses: expenseRows
        .sort((left, right) => right.value - left.value)
        .slice(0, 5),
    };
  }, [budgetLines, cashflowsById, accountsById]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Projected Income",
        value: formatCurrency(dashboardData.income),
        color: "#059669",
        background: "#ecfdf5",
      },
      {
        label: "Projected Expenses",
        value: formatCurrency(dashboardData.expenses),
        color: "#dc2626",
        background: "#fef2f2",
      },
      {
        label: "Projected Savings",
        value: formatCurrency(dashboardData.savings),
        color: "#7c3aed",
        background: "#f5f3ff",
      },
      {
        label: "Projected Debt Payments",
        value: formatCurrency(dashboardData.debt),
        color: "#ea580c",
        background: "#fff7ed",
      },
      {
        label: "Projected Remaining Cash Flow",
        value: formatCurrency(dashboardData.remaining),
        color: dashboardData.remaining >= 0 ? "#059669" : "#dc2626",
        background: dashboardData.remaining >= 0 ? "#ecfdf5" : "#fef2f2",
      },
    ],
    [dashboardData]
  );

  const breakdown = useMemo(
    () => [
      {
        label: "Expenses",
        value: getPercentage(
          dashboardData.expenses,
          dashboardData.totalAllocated
        ),
        rawValue: dashboardData.expenses,
        color: "#ef4444",
      },
      {
        label: "Savings",
        value: getPercentage(
          dashboardData.savings,
          dashboardData.totalAllocated
        ),
        rawValue: dashboardData.savings,
        color: "#8b5cf6",
      },
      {
        label: "Debt",
        value: getPercentage(dashboardData.debt, dashboardData.totalAllocated),
        rawValue: dashboardData.debt,
        color: "#f59e0b",
      },
      {
        label: "Remaining",
        value: getPercentage(
          Math.max(dashboardData.remaining, 0),
          dashboardData.totalAllocated
        ),
        rawValue: Math.max(dashboardData.remaining, 0),
        color: "#10b981",
      },
    ],
    [dashboardData]
  );

  const conicGradient = useMemo(() => {
    if (dashboardData.totalAllocated <= 0) {
      return "conic-gradient(#e5e7eb 0deg 360deg)";
    }

    let currentDegrees = 0;

    const segments = breakdown.map((item) => {
      const degrees =
        (item.rawValue / dashboardData.totalAllocated) * 360;
      const start = currentDegrees;
      const end = currentDegrees + degrees;

      currentDegrees = end;

      return `${item.color} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${segments.join(", ")})`;
  }, [breakdown, dashboardData.totalAllocated]);

  // loading is provided by the data hook

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

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
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

        <Chip
          icon={<CalendarMonthRoundedIcon />}
          label={formatMonthLabel(monthKey)}
          variant="outlined"
          sx={{
            height: "40px",
            px: "8px",
            borderRadius: "8px",
            bgcolor: "background.paper",
            fontWeight: 600,
          }}
        />
      </Box>

      {isLoading ? (
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
              Loading dashboard...
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
                  md: card.label.includes("Remaining") ? 6 : 4,
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
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Top Planned Expenses
                      </Typography>

                      <Typography
                        color="text.secondary"
                        variant="body2"
                        sx={{ mt: "4px" }}
                      >
                        Your largest budgeted categories.
                      </Typography>
                    </Box>

                    <Divider />

                    {dashboardData.topExpenses.length === 0 ? (
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
                        {dashboardData.topExpenses.map((expense) => (
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

                    <Button
                      component={Link}
                      href="/budgets"
                      variant="contained"
                      endIcon={<ArrowForwardRoundedIcon />}
                      sx={{
                        mt: "8px",
                        borderRadius: "8px",
                        textTransform: "none",
                        fontWeight: 700,
                      }}
                    >
                      View all in Budgets
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}