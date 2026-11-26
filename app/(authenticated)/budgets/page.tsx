"use client";

import MonthPickerControl, { getCurrentMonthKey } from "@/components/MonthPickerControl";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import useCategories from "@/lib/hooks/useCategories";
import useTransactions from "@/lib/hooks/useTransactions";
import { archivedCategoryActuals, categoryActuals, transferActualsByAccount } from "@/lib/budgetCalculations";
import { formatCurrency } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";

import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  InputAdornment,
  LinearProgress,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

type BudgetLineType = "income" | "expense" | "transfer";

type BudgetGroup = {
  title: string;
  color: string;
  background: string;
  icon: ReactNode;
  items: {
    id: string;
    categoryOrAccountId: string;
    lineType: BudgetLineType;
    label: string;
    value: string;
    actual: number;
  }[];
};

function parseBudgetInput(value: string) {
  const parsed = Number(value || 0);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

function getProgress(planned: number, actual: number) {
  const ratio = planned > 0 ? actual / planned : actual > 0 ? 1 : 0;
  const displayPct = Math.round(Math.min(ratio, 9.99) * 100);
  const barPct = Math.min(ratio, 1) * 100;
  return { displayPct, barPct };
}

export default function BudgetsPage() {
  const { user, authLoading } = useAuth();
  const { categories } = useCategories(user, authLoading);
  const { accounts } = useAccounts(user, authLoading);
  const {
    selectedMonthKey: monthKey,
    setSelectedMonthKey: setMonthKey,
    budgetValues,
    setBudgetValue,
    saveStatus,
    flushSave,
    error,
  } = useBudget(user, authLoading);
  // Loads far enough back to cover the month on screen.
  const { transactions = [], transactionsLoading } = useTransactions(user, authLoading, accounts, monthKey);
  const isLoading = authLoading;

  const isCurrentMonth = monthKey === getCurrentMonthKey();

  function goToCurrentMonth() {
    setMonthKey(getCurrentMonthKey());
  }

  const activeCategories = useMemo(
    () => categories.filter((category) => !category.isArchived),
    [categories]
  );

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.isArchived),
    [accounts]
  );

  const incomeCategories = useMemo(
    () => activeCategories.filter((category) => category.kind === "income"),
    [activeCategories]
  );

  const expenseCategories = useMemo(
    () => activeCategories.filter((category) => category.kind === "expense"),
    [activeCategories]
  );

  const assetAccounts = useMemo(
    () => activeAccounts.filter((account) => account.normalBalance === "asset"),
    [activeAccounts]
  );

  const liabilityAccounts = useMemo(
    () => activeAccounts.filter((account) => account.normalBalance === "liability"),
    [activeAccounts]
  );

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  // Category actuals for the month, net of refunds.
  const actualByCategoryId = useMemo(
    () => categoryActuals(transactions, categoriesById, monthKey),
    [transactions, categoriesById, monthKey]
  );

  const actualByAccountId = useMemo(() => transferActualsByAccount(transactions, monthKey), [transactions, monthKey]);

  // Money on archived categories, which the budget lines below don't show.
  const archivedActuals = useMemo(
    () => archivedCategoryActuals(transactions, categoriesById, actualByCategoryId, monthKey),
    [transactions, categoriesById, actualByCategoryId, monthKey]
  );

  const budgetGroups: BudgetGroup[] = useMemo(
    () => [
      {
        title: "Income",
        color: "#059669",
        background: "#ecfdf5",
        icon: <ArrowUpwardRoundedIcon sx={{ fontSize: 20 }} />,
        items: incomeCategories.map((category) => {
          const fallbackValue = category.estimatedMonthly != null
            ? Number(category.estimatedMonthly).toFixed(2)
            : "0.00";
          return {
            id: `category_${category.id}`,
            categoryOrAccountId: category.id,
            lineType: "income" as const,
            label: category.name,
            value: budgetValues[`category_${category.id}`] ?? fallbackValue,
            actual: actualByCategoryId.get(category.id) ?? 0,
          };
        }),
      },
      {
        title: "Expenses",
        color: "#dc2626",
        background: "#fef2f2",
        icon: <ArrowDownwardRoundedIcon sx={{ fontSize: 20 }} />,
        items: expenseCategories.map((category) => {
          const fallbackValue = category.estimatedMonthly != null
            ? Number(category.estimatedMonthly).toFixed(2)
            : "0.00";
          return {
            id: `category_${category.id}`,
            categoryOrAccountId: category.id,
            lineType: "expense" as const,
            label: category.name,
            value: budgetValues[`category_${category.id}`] ?? fallbackValue,
            actual: actualByCategoryId.get(category.id) ?? 0,
          };
        }),
      },
      {
        title: "Savings",
        color: "#7c3aed",
        background: "#f5f3ff",
        icon: <SavingsRoundedIcon sx={{ fontSize: 20 }} />,
        items: assetAccounts.map((account) => ({
          id: `account_${account.id}`,
          categoryOrAccountId: account.id,
          lineType: "transfer" as const,
          label: account.name,
          value: budgetValues[`account_${account.id}`] ?? "0.00",
          actual: actualByAccountId.get(account.id) ?? 0,
        })),
      },
      {
        title: "Debt",
        color: "#ea580c",
        background: "#fff7ed",
        icon: <CreditCardRoundedIcon sx={{ fontSize: 20 }} />,
        items: liabilityAccounts.map((account) => ({
          id: `account_${account.id}`,
          categoryOrAccountId: account.id,
          lineType: "transfer" as const,
          label: account.name,
          value: budgetValues[`account_${account.id}`] ?? "0.00",
          actual: actualByAccountId.get(account.id) ?? 0,
        })),
      },
    ],
    [
      incomeCategories,
      expenseCategories,
      assetAccounts,
      liabilityAccounts,
      budgetValues,
      actualByCategoryId,
      actualByAccountId,
    ]
  );

  // Totals add up the amounts shown on the lines, including unset lines
  // that show the category's estimate.
  const summary = useMemo(() => {
    const groupTotal = (title: string) =>
      budgetGroups
        .find((group) => group.title === title)
        ?.items.reduce((total, item) => total + parseBudgetInput(item.value), 0) ?? 0;

    const income = groupTotal("Income");
    const expenses = groupTotal("Expenses");
    const savings = groupTotal("Savings");
    const debt = groupTotal("Debt");
    const remaining = income - expenses - savings - debt;

    return [
      { label: "Total Income", value: income, color: "#059669", bg: "#ecfdf5", icon: <ArrowUpwardRoundedIcon sx={{ fontSize: 20 }} /> },
      { label: "Total Expenses", value: expenses, color: "#dc2626", bg: "#fef2f2", icon: <ArrowDownwardRoundedIcon sx={{ fontSize: 20 }} /> },
      { label: "Total Savings", value: savings, color: "#7c3aed", bg: "#f5f3ff", icon: <SavingsRoundedIcon sx={{ fontSize: 20 }} /> },
      { label: "Total Debt", value: debt, color: "#ea580c", bg: "#fff7ed", icon: <CreditCardRoundedIcon sx={{ fontSize: 20 }} /> },
      {
        label: "Remaining Cash Flow",
        value: remaining,
        color: remaining >= 0 ? "#059669" : "#dc2626",
        bg: remaining >= 0 ? "#ecfdf5" : "#fef2f2",
        icon: <ShowChartRoundedIcon sx={{ fontSize: 20 }} />,
      },
    ];
  }, [budgetGroups]);

  function handleBudgetValueChange(
    item: { id: string; categoryOrAccountId: string; lineType: BudgetLineType },
    nextValue: string
  ) {
    setBudgetValue(item.id, nextValue, item.lineType, item.categoryOrAccountId);
  }

  return (
    <Stack spacing={3} sx={{ p: 4 }}>
      <Stack spacing={1.5}>
        <PageHeader title="Budgets">
          <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px" }}>
            <MonthPickerControl monthKey={monthKey} onChange={setMonthKey} ariaLabelPrefix="Budgets " />
            {!isCurrentMonth && (
              <Button
                onClick={goToCurrentMonth}
                variant="text"
                size="small"
                sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
              >
                Today
              </Button>
            )}
          </Box>
        </PageHeader>

        {error && (
          <Snackbar
            open={Boolean(error)}
            autoHideDuration={5000}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            <Alert
              severity="error"
              variant="filled"
              sx={{ borderRadius: 2, boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)", fontWeight: 600 }}
            >
              {error}
            </Alert>
          </Snackbar>
        )}

        <Stack
          spacing={2}
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: "14px" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 90, justifyContent: "flex-end" }}>
              {saveStatus === "saving" && (
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>
                  Saving…
                </Typography>
              )}
              {saveStatus === "saved" && (
                <Stack sx={{display: "flex", flexDirection: "row", alignItems: "center"}}>
                  <CheckCircleRoundedIcon sx={{ fontSize: 16, color: "#059669" }} />
                  <Typography variant="caption" sx={{ color: "#059669", fontWeight: 600 }}>
                    Saved
                  </Typography>
                </Stack>
              )}
              {saveStatus === "error" && (
                <Stack
                  spacing={0.5}
                  onClick={() => flushSave()}
                  sx={{ display: "flex", flexDirection: "row", alignItems: "center", cursor: "pointer" }}
                >
                  <ErrorRoundedIcon sx={{ fontSize: 16, color: "#dc2626" }} />
                  <Typography variant="caption" sx={{ color: "#dc2626", fontWeight: 600 }}>
                    Save failed • Retry
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        {summary.map((item) => (
          <Grid key={item.label} size={{ xs: 12, sm: 6, md: 2.4 }}>
            <Card
              elevation={0}
              sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper", height: "100%" }}
            >
              <CardContent sx={{ p: 2, display: "flex", flexDirection: "row", alignItems: "center", gap: 1.5, "&:last-child": { pb: 2 } }}>
                <Box
                  sx={{
                    width: 40, height: 40, borderRadius: "50%", bgcolor: item.bg, color: item.color,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                >
                  {item.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>
                    {item.label}
                  </Typography>
                  <Typography variant="h6" sx={{ color: item.color, fontWeight: 800, letterSpacing: "-0.02em", fontSize: "1.15rem" }}>
                    {formatCurrency(item.value)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {!isLoading && archivedActuals.total > 0 && (
        <Alert
          severity="warning"
          icon={<WarningAmberRoundedIcon />}
          sx={{ borderRadius: 3 }}
          action={
            <Button
              component={Link}
              href="/categories"
              size="small"
              color="inherit"
              sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
            >
              Review categories
            </Button>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatCurrency(archivedActuals.total)} across {archivedActuals.transactionCount}{" "}
            transaction{archivedActuals.transactionCount === 1 ? "" : "s"} this month is assigned to
            archived categories and isn&apos;t included in the totals below.
          </Typography>
        </Alert>
      )}

      {isLoading ? (
        <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="body2" color="text.secondary">
              Loading budget...
            </Typography>
          </CardContent>
        </Card>
      ) : (
        budgetGroups.map((group) => (
          <Card
            key={group.title}
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper", overflow: "hidden" }}
          >
            {/* Group Header Block */}
            <Box
              sx={{
                px: 3, py: 2, bgcolor: group.background,
                borderBottom: "1px solid", borderColor: "divider",
                display: "flex", flexDirection: "row", alignItems: "center", gap: 1.5
              }}
            >
              <Box
                sx={{
                  width: 36, height: 36, borderRadius: "50%", bgcolor: "#fff", color: group.color,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  border: "1px solid", borderColor: "divider",
                }}
              >
                {group.icon}
              </Box>
              <Box>
                <Typography variant="h6" sx={{ color: group.color, fontWeight: 700, fontSize: "1.05rem" }}>
                  {group.title}
                </Typography>
              </Box>
            </Box>

            <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
              {group.items.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 2.5 }}>
                  No active items in this section yet.
                </Typography>
              ) : (
                <TableContainer>
                  <Table sx={{ minWidth: 650 }}>
                    <TableHead>
                      <TableRow sx={{ "& th": { borderBottom: "1px solid", borderColor: "divider", py: 1.5, fontWeight: 700, color: "text.secondary" } }}>
                        <TableCell>{group.title == "Income" ? "Source" : group.title == "Expenses" ? "Category" : "Account"}</TableCell>
                        <TableCell align="right">Planned</TableCell>
                        <TableCell align="right">Actual</TableCell>
                        <TableCell align="center">Utilization</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.items.map((item) => {
                        const planned = parseBudgetInput(item.value);
                        const progress = getProgress(planned, item.actual);

                        return (
                          <TableRow
                            key={item.id}
                            sx={{ "& td": { borderBottom: "1px solid", borderColor: "divider", py: 1.5 } }}
                          >
                            <TableCell sx={{ fontWeight: 500, color: "#0f172a" }}>
                              {item.label}
                            </TableCell>
                            <TableCell align="right">
                              <TextField
                                variant="standard"
                                value={item.value}
                                onChange={(event) => handleBudgetValueChange(item, event.target.value)}
                                onBlur={() => flushSave()}
                                size="small"
                                slotProps={{
                                  htmlInput: { min: 0, step: 0.01 },
                                  input: {
                                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                  },
                                }}
                                sx={{ "& input": { textAlign: "right" }, maxWidth: 140 }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ color: "#475569" }}>
                              {transactionsLoading ? "…" : formatCurrency(item.actual)}
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 1.5 }}>
                                <LinearProgress
                                  variant="determinate"
                                  value={progress.barPct}
                                  sx={{
                                    flex: 1, height: 6, borderRadius: 3, bgcolor: "#f1f5f9",
                                    "& .MuiLinearProgress-bar": { bgcolor: group.color, borderRadius: 3 },
                                  }}
                                />
                                <Typography variant="caption" sx={{ width: 38, textAlign: "right", color: "#64748b", fontWeight: 600, flexShrink: 0 }}>
                                  {progress.displayPct}%
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}


