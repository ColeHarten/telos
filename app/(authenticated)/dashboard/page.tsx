"use client";

import { MonthPickerControl, formatMonthLabel, getCurrentMonthKey, shiftMonthKey } from "@/components/MonthPickerControl";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import useCashflows from "@/lib/hooks/useCashflows";
import useTransactions from "@/lib/hooks/useTransactions";
import { formatCurrency } from "@/lib/utils";

// Icons
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DonutLargeRoundedIcon from "@mui/icons-material/DonutLargeRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import NorthRoundedIcon from "@mui/icons-material/NorthRounded";
import SouthRoundedIcon from "@mui/icons-material/SouthRounded";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

// ---------------------------------------------------------------------------
// Local types (structural — only what this file uses)
// ---------------------------------------------------------------------------

type AccountLike = {
  id: string;
  name: string;
  accountType: string;
  normalBalance: "asset" | "liability";
  currentBalance?: number;
  isArchived: boolean;
};

type CashflowLike = {
  id: string;
  name: string;
  kind: "income" | "expense";
  isArchived: boolean;
};

type BudgetLineLike = {
  id: string;
  lineType: "cashflow" | "account_transfer";
  planned: number;
  cashflowId?: string;
  toAccountId?: string;
};

type TransactionLike = {
  id: string;
  accountId: string;
  accountName: string;
  displayName: string;
  amount: number; // > 0 = money out, < 0 = money in
  date: string; // "YYYY-MM-DD"
  pending: boolean;
  cashflowId: string | undefined;
};

// ---------------------------------------------------------------------------
// Small formatting / date helpers
// ---------------------------------------------------------------------------

function isInMonth(dateStr: string, monthKey: string) {
  return dateStr.startsWith(monthKey);
}

function daysInMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function pctMonthElapsed(monthKey: string) {
  const today = new Date();
  const todayKey = getCurrentMonthKey();
  if (monthKey !== todayKey) {
    return monthKey < todayKey ? 1 : 0;
  }
  return Math.min(1, today.getDate() / daysInMonth(monthKey));
}

function formatShortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function formatShortDate(dateStr: string) {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// Matches the account-type chip treatment on the Accounts page.
function accountTypeChipStyle(accountType: string) {
  if (accountType === "cash") return { bg: "#f0fdf4", color: "#16a34a" };
  if (accountType === "credit_card" || accountType === "loan" || accountType === "other_liability") {
    return { bg: "#fef2f2", color: "#dc2626" };
  }
  return { bg: "#eff6ff", color: "#2563eb" };
}

function accountTypeLabel(accountType: string) {
  return accountType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [] } = useAccounts(user, authLoading) as { accounts: AccountLike[] };
  const { cashflows = [] } = useCashflows(user, authLoading) as { cashflows: CashflowLike[] };
  const { rangeBudgets, rangeLoading, loadBudgetRange } = useBudget(user, authLoading);
  const { transactions = [], transactionsLoading } = useTransactions(user, authLoading, accounts as never);

  const [monthKey, setMonthKey] = useState<string>(() => getCurrentMonthKey());
  const [showAllBudgetRows, setShowAllBudgetRows] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    loadBudgetRange(monthKey, monthKey).catch(() => {});
  }, [authLoading, user, monthKey, loadBudgetRange]);

  const cashflowsById = useMemo(() => new Map(cashflows.map((c) => [c.id, c])), [cashflows]);
  const activeCashflows = useMemo(() => cashflows.filter((c) => !c.isArchived), [cashflows]);

  // 1. Net worth ------------------------------------------------------------
  const netWorth = useMemo(() => {
    const live = accounts.filter((a) => !a.isArchived);
    let cash = 0;
    let investments = 0;
    let debt = 0;

    for (const account of live) {
      const balance = account.currentBalance ?? 0;
      if (account.normalBalance === "liability") {
        debt += balance;
        continue;
      }
      if (account.accountType === "cash") cash += balance;
      else investments += balance;
    }

    return { total: cash + investments - debt, cash, investments, debt };
  }, [accounts]);

  // Budget lines for the selected month --------------------------------------
  const budgetLines = useMemo(() => {
    const lines = (rangeBudgets?.[monthKey] ?? {}) as Record<string, BudgetLineLike>;
    return Object.values(lines);
  }, [rangeBudgets, monthKey]);

  const plannedByCashflowId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of budgetLines) {
      if (line.lineType === "cashflow" && line.cashflowId) {
        map.set(line.cashflowId, (map.get(line.cashflowId) ?? 0) + Number(line.planned ?? 0));
      }
    }
    return map;
  }, [budgetLines]);

  // Transactions scoped to the selected month ---------------------------------
  const monthTransactions = useMemo(
    () => (transactions as TransactionLike[]).filter((tx) => isInMonth(tx.date, monthKey)),
    [transactions, monthKey]
  );

  const actualByCashflowId = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of monthTransactions) {
      if (!tx.cashflowId) continue;
      const cashflow = cashflowsById.get(tx.cashflowId);
      if (!cashflow) continue;
      const contribution = cashflow.kind === "income" ? Math.max(0, -tx.amount) : Math.max(0, tx.amount);
      map.set(tx.cashflowId, (map.get(tx.cashflowId) ?? 0) + contribution);
    }
    return map;
  }, [monthTransactions, cashflowsById]);

  // 2. Budget vs Actual (hero) -----------------------------------------------
  const budgetRows = useMemo(() => {
    const elapsed = pctMonthElapsed(monthKey);

    return activeCashflows
      .filter((c) => c.kind === "expense")
      .map((cashflow) => {
        const planned = plannedByCashflowId.get(cashflow.id) ?? 0;
        const actual = actualByCashflowId.get(cashflow.id) ?? 0;
        const pctUsed = planned > 0 ? actual / planned : actual > 0 ? Infinity : 0;
        const remaining = planned - actual;

        let status: "over" | "near" | "ontrack" = "ontrack";
        if (planned > 0 && actual > planned) status = "over";
        else if (planned > 0 && actual / planned >= 0.9) status = "near";

        let pacing: "ahead" | "behind" | "on" | null = null;
        if (planned > 0) {
          const delta = pctUsed - elapsed;
          pacing = delta > 0.05 ? "behind" : delta < -0.05 ? "ahead" : "on";
        }

        return { cashflow, planned, actual, pctUsed, remaining, status, pacing };
      })
      .filter((row) => row.planned > 0 || row.actual > 0)
      .sort((a, b) => b.actual - a.actual);
  }, [activeCashflows, plannedByCashflowId, actualByCashflowId, monthKey]);

  const heroTotals = useMemo(() => {
    const planned = budgetRows.reduce((sum, r) => sum + r.planned, 0);
    const actual = budgetRows.reduce((sum, r) => sum + r.actual, 0);
    return { planned, actual, pct: planned > 0 ? Math.min(1, actual / planned) : 0 };
  }, [budgetRows]);

  const priorityRows = useMemo(() => {
    const over = budgetRows.filter((r) => r.status === "over");
    const near = budgetRows.filter((r) => r.status === "near");
    const rest = budgetRows
      .filter((r) => r.status === "ontrack")
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, Math.max(0, 4 - over.length - near.length));
    return [...over, ...near, ...rest];
  }, [budgetRows]);

  const visibleRows = showAllBudgetRows ? budgetRows : priorityRows;
  const hiddenCount = budgetRows.length - priorityRows.length;

  // 3. Monthly snapshot -------------------------------------------------------
  const incomeCashflowIds = useMemo(
    () => new Set(activeCashflows.filter((c) => c.kind === "income").map((c) => c.id)),
    [activeCashflows]
  );

  const monthlySnapshot = useMemo(() => {
    const income = [...incomeCashflowIds].reduce((sum, id) => sum + (actualByCashflowId.get(id) ?? 0), 0);
    const netCashFlow = income - heroTotals.actual;
    const needsReviewCount = monthTransactions.filter((tx) => !tx.cashflowId).length;
    const upcomingCount = budgetRows.filter((r) => r.planned > 0 && r.actual === 0).length;

    return {
      netCashFlow,
      budgetUsedPct: heroTotals.planned > 0 ? heroTotals.actual / heroTotals.planned : 0,
      needsReviewCount,
      upcomingCount,
    };
  }, [incomeCashflowIds, actualByCashflowId, heroTotals, monthTransactions, budgetRows]);

  // 4a. Cash flow trend (actual, last 6 months) --------------------------------
  const cashFlowTrend = useMemo(() => {
    const months: string[] = [];
    let cursor = monthKey;
    for (let i = 0; i < 6; i += 1) {
      months.unshift(cursor);
      cursor = shiftMonthKey(cursor, -1);
    }

    return months.map((key) => {
      let inflow = 0;
      let outflow = 0;
      for (const tx of transactions as TransactionLike[]) {
        if (!isInMonth(tx.date, key)) continue;
        if (tx.amount < 0) inflow += Math.abs(tx.amount);
        else outflow += tx.amount;
      }
      return { monthKey: key, label: formatShortMonthLabel(key), net: inflow - outflow, inflow, outflow };
    });
  }, [transactions, monthKey]);

  const currentMonthCashFlow = cashFlowTrend[cashFlowTrend.length - 1] ?? { inflow: 0, outflow: 0, net: 0 };

  // 4b. Needs review ------------------------------------------------------------
  const needsReviewTransactions = useMemo(() => {
    return (transactions as TransactionLike[])
      .filter((tx) => !tx.cashflowId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4);
  }, [transactions]);

  const needsReviewTotal = useMemo(
    () => (transactions as TransactionLike[]).filter((tx) => !tx.cashflowId).length,
    [transactions]
  );

  // 5. Upcoming (heuristic — see note) -------------------------------------------
  // NOTE: without expectedCharges (merchant + amount + cadence) yet, this
  // approximates "upcoming" as budgeted expense cashflows with no matching
  // transaction yet this month. Swap out once that model exists.
  const upcoming = useMemo(() => {
    return budgetRows
      .filter((r) => r.planned > 0 && r.actual === 0)
      .sort((a, b) => b.planned - a.planned)
      .slice(0, 4);
  }, [budgetRows]);

  // 6. Recent transactions -------------------------------------------------------
  const recentTransactions = useMemo(
    () => [...(transactions as TransactionLike[])].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5),
    [transactions]
  );

  // Negative run-rate check --------------------------------------------------------
  const runRateDeficit = useMemo(() => {
    const plannedExpenses = budgetRows.reduce((sum, r) => sum + r.planned, 0);
    const plannedIncome = [...incomeCashflowIds].reduce((sum, id) => sum + (plannedByCashflowId.get(id) ?? 0), 0);
    return plannedExpenses > plannedIncome ? plannedExpenses - plannedIncome : 0;
  }, [budgetRows, incomeCashflowIds, plannedByCashflowId]);

  const isLoading = authLoading || rangeLoading || transactionsLoading;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "24px", bgcolor: "#f8fafc", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em", color: "#0f172a", fontSize: "1.75rem" }}>
          Dashboard
        </Typography>
        <MonthPickerControl monthKey={monthKey} onChange={setMonthKey} showStepButtons />
      </Box>

      {!isLoading && runRateDeficit > 0 && (
        <Alert severity="warning" icon={<WarningAmberRoundedIcon sx={{ fontSize: 22 }} />} sx={{ borderRadius: "12px" }}>
          <AlertTitle sx={{ fontWeight: 700, fontSize: "0.9rem" }}>Negative run-rate</AlertTitle>
          Planned expenses exceed planned income by <strong>{formatCurrency(runRateDeficit)}</strong> this month.
        </Alert>
      )}

      {/* 1. Net worth — 4-card metric row, matching the Accounts page pattern */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" }, gap: "16px" }}>
        <MetricCard
          label="Net Worth"
          value={formatCurrency(netWorth.total)}
          subtitle="Across all active accounts"
          icon={<SwapHorizRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg="#f5f3ff"
          iconColor="#7c3aed"
        />
        <MetricCard
          label="Cash"
          value={formatCurrency(netWorth.cash)}
          subtitle={`${accounts.filter((a) => !a.isArchived && a.accountType === "cash").length} accounts`}
          icon={<TrendingUpRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg="#f0fdf4"
          iconColor="#16a34a"
        />
        <MetricCard
          label="Investments"
          value={formatCurrency(netWorth.investments)}
          subtitle="Non-cash assets"
          icon={<TrendingUpRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
        />
        <MetricCard
          label="Debt"
          value={formatCurrency(-netWorth.debt)}
          subtitle="Across liabilities"
          valueColor="#dc2626"
          icon={<TrendingDownRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg="#fef2f2"
          iconColor="#dc2626"
        />
      </Box>

      {/* 2. Budget vs Actual — hero */}
      <Card variant="outlined" sx={{ borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
        <CardContent sx={{ p: "24px" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
              flexWrap: "wrap",
              rowGap: "8px",
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: "1.2rem", color: "#0f172a", letterSpacing: "-0.02em" }}>
              {formatMonthLabel(monthKey)} Budget
            </Typography>
            <Typography variant="body2" sx={{ color: "#64748b" }}>
              {formatCurrency(heroTotals.actual)} of {formatCurrency(heroTotals.planned)} spent
              {" · "}
              <Box component="span" sx={{ fontWeight: 700, color: "#0f172a" }}>
                {Math.round(heroTotals.pct * 100)}%
              </Box>
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={Math.round(heroTotals.pct * 100)}
            sx={{
              mt: 1.5,
              mb: 2.5,
              height: 8,
              borderRadius: 4,
              bgcolor: "#f1f5f9",
              "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: heroTotals.pct > 1 ? "#dc2626" : "#2563eb" },
            }}
          />

          {budgetRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No budgeted expenses for this month yet.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {visibleRows.map((row) => (
                <BudgetRow key={row.cashflow.id} row={row} />
              ))}
            </Box>
          )}

          {hiddenCount > 0 && (
            <Button
              size="small"
              onClick={() => setShowAllBudgetRows((v) => !v)}
              sx={{ mt: 2.5, textTransform: "none", fontWeight: 600, px: 0, color: "#2563eb" }}
            >
              {showAllBudgetRows ? "Show less" : `+ ${hiddenCount} more`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 3. Monthly snapshot — 4-card metric row */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" }, gap: "16px" }}>
        <MetricCard
          label="Net Cash Flow"
          value={formatCurrency(monthlySnapshot.netCashFlow)}
          subtitle="This month"
          valueColor={monthlySnapshot.netCashFlow >= 0 ? "#059669" : "#dc2626"}
          icon={<SwapHorizRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg="#f5f3ff"
          iconColor="#7c3aed"
        />
        <MetricCard
          label="Budget Used"
          value={`${Math.round(monthlySnapshot.budgetUsedPct * 100)}%`}
          subtitle={`${formatCurrency(heroTotals.actual)} of ${formatCurrency(heroTotals.planned)}`}
          icon={<DonutLargeRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
        />
        <MetricCard
          label="To Review"
          value={String(monthlySnapshot.needsReviewCount)}
          subtitle="Transactions"
          valueColor={monthlySnapshot.needsReviewCount > 0 ? "#d97706" : "#0f172a"}
          icon={<WarningAmberRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg={monthlySnapshot.needsReviewCount > 0 ? "#fffbeb" : "#f0fdf4"}
          iconColor={monthlySnapshot.needsReviewCount > 0 ? "#d97706" : "#16a34a"}
        />
        <MetricCard
          label="Upcoming Bills"
          value={String(monthlySnapshot.upcomingCount)}
          subtitle="This month"
          icon={<EventRoundedIcon sx={{ fontSize: 20 }} />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
        />
      </Box>

      {/* 4. Cash flow trend + Needs review */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" }, gap: "16px" }}>
        <Card variant="outlined" sx={{ borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
          <CardContent sx={{ p: "20px" }}>
            <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.05rem" }}>Cash Flow</Typography>
            <Box sx={{ display: "flex", flexDirection: "row", gap: "32px", mt: 2, alignItems: "flex-end", flexWrap: "wrap", rowGap: "12px" }}>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Income</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: "1.3rem", color: "#059669" }}>
                  {formatCurrency(currentMonthCashFlow.inflow)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Expenses</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: "1.3rem", color: "#dc2626" }}>
                  {formatCurrency(currentMonthCashFlow.outflow)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Net</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: "1.3rem", color: currentMonthCashFlow.net >= 0 ? "#059669" : "#dc2626" }}>
                  {currentMonthCashFlow.net >= 0 ? "+" : ""}
                  {formatCurrency(currentMonthCashFlow.net)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 120, height: 44 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cashFlowTrend}>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                      contentStyle={{ fontSize: "0.75rem", borderRadius: 8 }}
                    />
                    <Line type="monotone" dataKey="net" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 1 }}>
              Last 6 months, actual transactions
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
          <CardContent sx={{ p: "20px" }}>
            <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.05rem" }}>Needs Review</Typography>
              <Chip
                size="small"
                label={needsReviewTotal}
                sx={{
                  height: 22,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  borderRadius: "6px",
                  bgcolor: needsReviewTotal > 0 ? "#fffbeb" : "#f0fdf4",
                  color: needsReviewTotal > 0 ? "#d97706" : "#16a34a",
                }}
              />
            </Box>

            {needsReviewTransactions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircleRoundedIcon sx={{ fontSize: 16, color: "#16a34a" }} />
                Everything is categorized.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: "12px", mt: 2 }}>
                {needsReviewTransactions.map((tx) => (
                  <Box key={tx.id} sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: "#f1f5f9", color: "#64748b" }}>
                        <StorefrontOutlinedIcon sx={{ fontSize: 15 }} />
                      </Avatar>
                      <Typography variant="body2" sx={{ color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tx.displayName}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", ml: 1 }}>
                      {formatCurrency(Math.abs(tx.amount))}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            <Button
              component={Link}
              href="/transactions"
              size="small"
              endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />}
              sx={{ mt: 2, textTransform: "none", fontWeight: 600, px: 0, color: "#2563eb" }}
            >
              View all
            </Button>
          </CardContent>
        </Card>
      </Box>

      {/* 5. Upcoming + Accounts */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "16px" }}>
        <Card variant="outlined" sx={{ borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
          <CardContent sx={{ p: "20px" }}>
            <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.05rem" }}>Upcoming</Typography>
            {upcoming.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Nothing budgeted is outstanding.
              </Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: "12px", mt: 2 }}>
                {upcoming.map((row) => (
                  <Box key={row.cashflow.id} sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px" }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: "#eff6ff", color: "#2563eb" }}>
                        <EventRoundedIcon sx={{ fontSize: 15 }} />
                      </Avatar>
                      <Typography variant="body2" sx={{ color: "#334155" }}>{row.cashflow.name}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a" }}>
                      {formatCurrency(row.planned)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 1.5 }}>
              Estimated from your budget
            </Typography>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
          <CardContent sx={{ p: "20px" }}>
            <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.05rem" }}>Accounts</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "14px", mt: 2 }}>
              {accounts
                .filter((a) => !a.isArchived)
                .map((account) => {
                  const chipStyle = accountTypeChipStyle(account.accountType);
                  return (
                    <Box key={account.id} sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px" }}>
                        <Typography variant="body2" sx={{ color: "#334155", fontWeight: 500 }}>{account.name}</Typography>
                        <Chip
                          size="small"
                          label={accountTypeLabel(account.accountType)}
                          sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700, borderRadius: "6px", bgcolor: chipStyle.bg, color: chipStyle.color }}
                        />
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: account.normalBalance === "liability" ? "#dc2626" : "#0f172a" }}
                      >
                        {account.normalBalance === "liability" ? "-" : ""}
                        {formatCurrency(Math.abs(account.currentBalance ?? 0))}
                      </Typography>
                    </Box>
                  );
                })}
              {accounts.filter((a) => !a.isArchived).length === 0 && (
                <Typography variant="body2" color="text.secondary">No accounts linked yet.</Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* 6. Recent transactions */}
      <Card variant="outlined" sx={{ borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
        <CardContent sx={{ p: "20px" }}>
          <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.05rem" }}>Recent Transactions</Typography>
            <Button
              component={Link}
              href="/transactions"
              size="small"
              endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />}
              sx={{ textTransform: "none", fontWeight: 600, color: "#2563eb" }}
            >
              View all
            </Button>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", mt: 1 }}>
            {recentTransactions.map((tx) => (
              <Box
                key={tx.id}
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: "12px",
                  borderBottom: "1px solid #f1f5f9",
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "12px", minWidth: 0 }}>
                  <Avatar sx={{ width: 34, height: 34, bgcolor: "#f1f5f9", color: "#64748b" }}>
                    <StorefrontOutlinedIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, color: "#0f172a", fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tx.displayName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                      {formatShortDate(tx.date)} · {tx.accountName}
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", whiteSpace: "nowrap", ml: 1.5, color: tx.amount > 0 ? "#dc2626" : "#16a34a" }}>
                  {tx.amount > 0 ? `(${tx.amount.toFixed(2)})` : Math.abs(tx.amount).toFixed(2)}
                </Typography>
              </Box>
            ))}
            {recentTransactions.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No transactions yet.</Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Small presentational subcomponents
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  subtitle,
  icon,
  iconBg,
  iconColor,
  valueColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}>
      <CardContent sx={{ p: "20px" }}>
        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>{label}</Typography>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: iconBg,
              color: iconColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        </Box>
        <Typography sx={{ fontWeight: 700, color: valueColor ?? "#0f172a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

type BudgetRowData = {
  cashflow: CashflowLike;
  planned: number;
  actual: number;
  pctUsed: number;
  remaining: number;
  status: "over" | "near" | "ontrack";
  pacing: "ahead" | "behind" | "on" | null;
};

function BudgetRow({ row }: { row: BudgetRowData }) {
  const barColor = row.status === "over" ? "#dc2626" : row.status === "near" ? "#d97706" : "#2563eb";
  const pct = row.planned > 0 ? Math.min(1, row.actual / row.planned) : row.actual > 0 ? 1 : 0;

  return (
    <Box>
      <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8px" }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a" }}>
            {row.cashflow.name}
          </Typography>
          {row.status === "over" && (
            <Chip
              size="small"
              icon={<WarningAmberRoundedIcon sx={{ fontSize: 14 }} />}
              label="Over budget"
              sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700, borderRadius: "6px", bgcolor: "#fef2f2", color: "#dc2626" }}
            />
          )}
          {row.pacing && row.status !== "over" && (
            <Chip
              size="small"
              icon={row.pacing === "behind" ? <NorthRoundedIcon sx={{ fontSize: 12 }} /> : row.pacing === "ahead" ? <SouthRoundedIcon sx={{ fontSize: 12 }} /> : undefined}
              label={row.pacing === "behind" ? "Behind pace" : row.pacing === "ahead" ? "Ahead of pace" : "On pace"}
              sx={{
                height: 20,
                fontSize: "0.68rem",
                fontWeight: 700,
                borderRadius: "6px",
                bgcolor: row.pacing === "behind" ? "#fffbeb" : "#f0fdf4",
                color: row.pacing === "behind" ? "#d97706" : "#16a34a",
              }}
            />
          )}
        </Box>
        <Typography variant="body2" sx={{ color: "#64748b" }}>
          {formatCurrency(row.actual)} / {formatCurrency(row.planned)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.round(pct * 100)}
        sx={{ height: 6, borderRadius: 3, bgcolor: "#f1f5f9", "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: barColor } }}
      />
    </Box>
  );
}