"use client";

import MonthPickerControl, { formatMonthLabel, getCurrentMonthKey } from "@/components/MonthPickerControl";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import useCategories from "@/lib/hooks/useCategories";
import useTransactions from "@/lib/hooks/useTransactions";
import {
  archivedCategoryActuals,
  categoryActuals,
  shiftMonthKey,
  transferActualsByAccount,
  uncategorizedSpending,
} from "@/lib/budgetCalculations";
import { copyLines, estimateLines, type BudgetSlot } from "@/lib/budgetTools";
import { formatCurrency } from "@/lib/utils";
import EmptyState from "@/components/EmptyState";
import { CardsSkeleton } from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
import StatStrip, { type Stat } from "@/components/StatStrip";

import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useMemo, useState, type ReactNode } from "react";

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
    setBudgetLinesBulk,
    readMonthLines,
    saveStatus,
    flushSave,
    error,
  } = useBudget(user, authLoading);
  const [shortcut, setShortcut] = useState<"copy" | "estimates" | null>(null);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  // Net money moved into each account, counted once (see transferActualsByAccount).
  const actualByAccountId = useMemo(
    () => transferActualsByAccount(transactions, accounts, monthKey),
    [transactions, accounts, monthKey]
  );

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
        color: "primary.main",
        background: "#eff6ff",
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

  // Money out this month still in Needs review, shown as its own line under Expenses.
  const uncategorized = useMemo(() => uncategorizedSpending(transactions, monthKey), [transactions, monthKey]);

  // Every line on the page, with what it shows when it was never set.
  const slots: BudgetSlot[] = useMemo(
    () =>
      budgetGroups.flatMap((group) =>
        group.items.map((item) => ({
          id: item.id,
          lineType: item.lineType,
          categoryId: item.categoryOrAccountId,
          fallback: item.lineType === "transfer" ? 0 : Number(categoriesById.get(item.categoryOrAccountId)?.estimatedMonthly ?? 0),
        }))
      ),
    [budgetGroups, categoriesById]
  );

  const previousMonthKey = shiftMonthKey(monthKey, -1);

  async function applyShortcut() {
    if (!shortcut) return;
    setShortcutBusy(true);
    setShortcutError(null);
    try {
      if (shortcut === "copy") {
        setBudgetLinesBulk(copyLines(await readMonthLines(previousMonthKey), slots));
        setNotice(`Copied the ${formatMonthLabel(previousMonthKey)} budget.`);
      } else {
        setBudgetLinesBulk(estimateLines(slots));
        setNotice("Income and expenses now match your category estimates.");
      }
      setShortcut(null);
    } catch (err) {
      console.error(err);
      setShortcutError("Could not read last month's budget. Try again.");
    } finally {
      setShortcutBusy(false);
    }
  }

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

    const stats: Stat[] = [
      { label: "Income", value: formatCurrency(income) },
      { label: "Expenses", value: formatCurrency(expenses) },
      { label: "Savings", value: formatCurrency(savings) },
      { label: "Debt", value: formatCurrency(debt) },
      {
        label: "Left to plan",
        value: formatCurrency(remaining),
        caption: remaining < 0 ? "Planned more than income" : "Income minus everything planned",
        tone: remaining < 0 ? "negative" : undefined,
      },
    ];
    return stats;
  }, [budgetGroups]);

  function handleBudgetValueChange(
    item: { id: string; categoryOrAccountId: string; lineType: BudgetLineType },
    nextValue: string
  ) {
    setBudgetValue(item.id, nextValue, item.lineType, item.categoryOrAccountId);
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1.5}>
        <PageHeader title="Budgets">
          <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <MonthPickerControl monthKey={monthKey} onChange={setMonthKey} ariaLabelPrefix="Budgets " />
            {!isCurrentMonth && (
              <Button
                onClick={goToCurrentMonth}
                variant="text"
                size="small"
              >
                Today
              </Button>
            )}
            <Button
              onClick={() => setShortcut("copy")}
              variant="text"
              size="small"
            >
              Copy last month
            </Button>
            <Button
              onClick={() => setShortcut("estimates")}
              variant="text"
              size="small"
            >
              Fill from estimates
            </Button>
          </Box>
        </PageHeader>

        {error && (
          <Snackbar
            open={Boolean(error)}
            autoHideDuration={5000}
          >
            <Alert severity="error" variant="filled">
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
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
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
                  <ErrorRoundedIcon sx={{ fontSize: 16, color: "error.main" }} />
                  <Typography variant="caption" sx={{ color: "error.main", fontWeight: 600 }}>
                    Save failed • Retry
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>
        </Stack>
      </Stack>

      <StatStrip stats={summary} />

      {!isLoading && archivedActuals.total > 0 && (
        <Alert
          severity="warning"
          icon={<WarningAmberRoundedIcon />}
          action={
            <Button
              component={Link}
              href="/categories"
              size="small"
              color="inherit"
              sx={{ whiteSpace: "nowrap" }}
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
        <CardsSkeleton heights={[220, 260, 160, 160]} />
      ) : (
        budgetGroups.map((group) => (
          <Card
            key={group.title}
            sx={{ overflow: "hidden" }}
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
                  width: 36, height: 36, borderRadius: "50%", bgcolor: "background.paper", color: group.color,
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
                <EmptyState
                  dense
                  title={`No ${group.title.toLowerCase()} lines yet`}
                  description={
                    group.title === "Income" || group.title === "Expenses"
                      ? "Lines come from your active categories. Add some on Categories."
                      : "Lines come from your active accounts. Add some on Accounts."
                  }
                />
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
                            <TableCell sx={{ fontWeight: 500, color: "text.primary" }}>
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
                            <TableCell align="right" sx={{ color: "grey.600" }}>
                              {transactionsLoading ? "…" : formatCurrency(item.actual)}
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 1.5 }}>
                                <LinearProgress
                                  variant="determinate"
                                  value={progress.barPct}
                                  sx={{
                                    flex: 1,
                                    height: 6,
                                    "& .MuiLinearProgress-bar": {
                                      bgcolor: group.title === "Expenses" && item.actual > planned ? "error.main" : group.color,
                                    },
                                  }}
                                />
                                <Typography variant="caption" sx={{ width: 38, textAlign: "right", color: "text.secondary", fontWeight: 600, flexShrink: 0 }}>
                                  {progress.displayPct}%
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {group.title === "Expenses" && uncategorized.total > 0 && (
                        <TableRow sx={{ "& td": { borderBottom: "1px solid", borderColor: "divider", py: 1.5 } }}>
                          <TableCell>
                            <Typography sx={{ fontWeight: 500, color: "text.primary", fontSize: "0.875rem" }}>Uncategorized</Typography>
                            <Typography
                              component={Link}
                              href="/transactions"
                              variant="caption"
                              sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                            >
                              {uncategorized.count} {uncategorized.count === 1 ? "transaction" : "transactions"} in Needs review
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ color: "grey.400" }}>Not planned</TableCell>
                          <TableCell align="right" sx={{ color: "grey.600" }}>
                            {transactionsLoading ? "…" : formatCurrency(uncategorized.total)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={shortcut !== null} onClose={shortcutBusy ? undefined : () => setShortcut(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {shortcut === "copy" ? "Copy last month" : "Fill from estimates"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "grey.700" }}>
            {shortcut === "copy"
              ? `Every line for ${formatMonthLabel(monthKey)} takes the amount it had in ${formatMonthLabel(previousMonthKey)}, replacing what's there now.`
              : `Every income and expense line for ${formatMonthLabel(monthKey)} takes its category's monthly estimate. Savings and debt lines stay as they are.`}
          </Typography>
          {shortcutError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {shortcutError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShortcut(null)} disabled={shortcutBusy}>
            Cancel
          </Button>
          <Button onClick={applyShortcut} disabled={shortcutBusy} variant="contained">
            {shortcut === "copy" ? "Copy" : "Fill"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </Stack>
  );
}


