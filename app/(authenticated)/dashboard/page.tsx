"use client";

import { MonthPickerControl, formatMonthLabel, getCurrentMonthKey, shiftMonthKey } from "@/components/MonthPickerControl";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import useCashflows from "@/lib/hooks/useCashflows";
import useTransactions from "@/lib/hooks/useTransactions";
import { formatCurrency } from "@/lib/utils";

// Icons
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import CurrencyBitcoinRoundedIcon from "@mui/icons-material/CurrencyBitcoinRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LabelRoundedIcon from "@mui/icons-material/LabelRounded";
import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import NorthEastRoundedIcon from "@mui/icons-material/NorthEastRounded";
import RequestQuoteRoundedIcon from "@mui/icons-material/RequestQuoteRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SouthRoundedIcon from "@mui/icons-material/SouthRounded";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import { Avatar, Box, Card, CardContent, Chip, LinearProgress, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis } from "recharts";
import type { Account, BudgetLine, Cashflow, Transaction } from "@/lib/types/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInMonth(dateStr: string, monthKey: string) {
  return dateStr.startsWith(monthKey);
}

function formatShortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, month - 1, 1));
}

function formatLongDate(dateStr: string) {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr: string) {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// Best-effort relative time from a Firestore-Timestamp-like value. Falls back
// to "Manual" for manual accounts, or nothing for accounts with no timestamp.
function formatRelativeSync(account: Account): string | null {
  const raw = account.updatedAt as { toDate?: () => Date; seconds?: number } | undefined;
  let date: Date | null = null;
  if (raw?.toDate) date = raw.toDate();
  else if (typeof raw?.seconds === "number") date = new Date(raw.seconds * 1000);

  if (!date) return account.isManual ? "Manual" : null;

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Deterministic string hash -> palette index, used for cashflows/accounts
// that don't match a keyword rule below.
function hashToIndex(input: string, size: number) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) hash = (hash * 31 + input.charCodeAt(i)) % 997;
  return hash % size;
}

const FALLBACK_PALETTE = [
  { bg: "#f5f3ff", color: "#7c3aed" },
  { bg: "#eff6ff", color: "#2563eb" },
  { bg: "#fff7ed", color: "#ea580c" },
  { bg: "#f0fdf4", color: "#16a34a" },
  { bg: "#fef2f2", color: "#dc2626" },
];

const CASHFLOW_ICON_RULES: { match: RegExp; icon: ReactNode; bg: string; color: string }[] = [
  { match: /din|restaurant|takeout|food/i, icon: <RestaurantRoundedIcon sx={{ fontSize: 18 }} />, bg: "#f5f3ff", color: "#7c3aed" },
  { match: /hous|rent|mortgage|utilit/i, icon: <HomeRoundedIcon sx={{ fontSize: 18 }} />, bg: "#eff6ff", color: "#2563eb" },
  { match: /grocer|supermarket/i, icon: <ShoppingCartRoundedIcon sx={{ fontSize: 18 }} />, bg: "#fff7ed", color: "#ea580c" },
  { match: /transport|gas|car|uber|lyft|parking|fuel/i, icon: <DirectionsCarRoundedIcon sx={{ fontSize: 18 }} />, bg: "#f0fdf4", color: "#16a34a" },
  { match: /entertain|movie|stream|music|netflix|spotify/i, icon: <MusicNoteRoundedIcon sx={{ fontSize: 18 }} />, bg: "#fef2f2", color: "#dc2626" },
];

function getCashflowVisual(cashflow: Cashflow) {
  const rule = CASHFLOW_ICON_RULES.find((r) => r.match.test(cashflow.name));
  if (rule) return rule;
  const palette = FALLBACK_PALETTE[hashToIndex(cashflow.id, FALLBACK_PALETTE.length)];
  return { icon: <LabelRoundedIcon sx={{ fontSize: 18 }} />, ...palette };
}

function getAccountVisual(account: Account) {
  switch (account.accountType) {
    case "cash":
      return { icon: <AccountBalanceRoundedIcon sx={{ fontSize: 17 }} />, bg: "#eff6ff", color: "#2563eb" };
    case "credit_card":
      return { icon: <CreditCardRoundedIcon sx={{ fontSize: 17 }} />, bg: "#fef2f2", color: "#dc2626" };
    case "investment":
    case "retirement":
      return { icon: <ShowChartRoundedIcon sx={{ fontSize: 17 }} />, bg: "#f0fdf4", color: "#16a34a" };
    case "loan":
      return { icon: <RequestQuoteRoundedIcon sx={{ fontSize: 17 }} />, bg: "#fff7ed", color: "#ea580c" };
    case "property":
      return { icon: <HomeRoundedIcon sx={{ fontSize: 17 }} />, bg: "#fff7ed", color: "#ea580c" };
    case "crypto":
      return { icon: <CurrencyBitcoinRoundedIcon sx={{ fontSize: 17 }} />, bg: "#f5f3ff", color: "#7c3aed" };
    default:
      return { icon: <AccountBalanceRoundedIcon sx={{ fontSize: 17 }} />, bg: "#f1f5f9", color: "#64748b" };
  }
}

function accountTypeLabel(accountType: string) {
  return accountType.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Pure percent-of-budget bucketing — this is what actually drives the
// "vs. pace" column (not a date-elapsed pacing calc).
function getBudgetStatus(pct: number, hasPlan: boolean) {
  if (!hasPlan) return { label: "No budget", bg: "#f1f5f9", color: "#64748b", icon: null };
  if (pct > 1) return { label: "Over budget", bg: "#fef2f2", color: "#dc2626", icon: <WarningAmberRoundedIcon sx={{ fontSize: 13 }} /> };
  if (pct >= 0.9) return { label: "Ahead", bg: "#fef3c7", color: "#d97706", icon: <NorthEastRoundedIcon sx={{ fontSize: 13 }} /> };
  if (pct >= 0.5) return { label: "On track", bg: "#f0fdf4", color: "#16a34a", icon: null };
  return { label: "Behind", bg: "#f1f5f9", color: "#64748b", icon: <SouthRoundedIcon sx={{ fontSize: 13 }} /> };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CARD_SX = { borderRadius: "16px", borderColor: "#e2e8f0", bgcolor: "#fff", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" } as const;
const VISIBLE_BUDGET_ROWS = 5;

export default function DashboardPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [] } = useAccounts(user, authLoading);
  const { cashflows = [] } = useCashflows(user, authLoading);
  const { rangeBudgets, rangeLoading, loadBudgetRange } = useBudget(user, authLoading);
  const { transactions = [], transactionsLoading } = useTransactions(user, authLoading, accounts);

  const [monthKey, setMonthKey] = useState<string>(() => getCurrentMonthKey());
  const [showAllBudgetRows, setShowAllBudgetRows] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    loadBudgetRange(monthKey, monthKey).catch(() => {});
  }, [authLoading, user, monthKey, loadBudgetRange]);

  const cashflowsById = useMemo(() => new Map(cashflows.map((c) => [c.id, c])), [cashflows]);
  const activeCashflows = useMemo(() => cashflows.filter((c) => !c.isArchived), [cashflows]);

  // Net worth -----------------------------------------------------------------
  const netWorth = useMemo(() => {
    const live = accounts.filter((a) => !a.isArchived);
    let cash = 0;
    let investments = 0;
    let debt = 0;
    for (const account of live) {
      const balance = account.currentBalance ?? 0;
      if (account.normalBalance === "liability") debt += balance;
      else if (account.accountType === "cash") cash += balance;
      else investments += balance;
    }
    return { total: cash + investments - debt, cash, investments, debt, assets: cash + investments };
  }, [accounts]);

  // Budget lines for the selected month ----------------------------------------
  const budgetLines = useMemo(() => {
    const lines = (rangeBudgets?.[monthKey] ?? {}) as Record<string, BudgetLine>;
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

  // Transactions scoped to the selected month ------------------------------------
  const monthTransactions = useMemo<Transaction[]>(
    () => transactions.filter((tx) => isInMonth(tx.date, monthKey)),
    [transactions, monthKey]
  );

  const actualByCashflowId = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of monthTransactions) {
      if (tx.assignmentType !== "cashflow" || !tx.assignmentId) continue;
      const cashflow = cashflowsById.get(tx.assignmentId);
      if (!cashflow) continue;
      const contribution = cashflow.kind === "income" ? Math.max(0, -tx.amount) : Math.max(0, tx.amount);
      map.set(tx.assignmentId, (map.get(tx.assignmentId) ?? 0) + contribution);
    }
    return map;
  }, [monthTransactions, cashflowsById]);

  // Budget vs Actual rows, ordered by the user's own cashflow sort order --------
  const budgetRows = useMemo(() => {
    return activeCashflows
      .filter((c) => c.kind === "expense")
      .map((cashflow) => {
        const planned = plannedByCashflowId.get(cashflow.id) ?? 0;
        const actual = actualByCashflowId.get(cashflow.id) ?? 0;
        const pct = planned > 0 ? actual / planned : actual > 0 ? Infinity : 0;
        return { cashflow, planned, actual, pct };
      })
      .filter((row) => row.planned > 0 || row.actual > 0)
      .sort((a, b) => a.cashflow.sortOrder - b.cashflow.sortOrder);
  }, [activeCashflows, plannedByCashflowId, actualByCashflowId]);

  const heroTotals = useMemo(() => {
    const planned = budgetRows.reduce((sum, r) => sum + r.planned, 0);
    const actual = budgetRows.reduce((sum, r) => sum + r.actual, 0);
    return { planned, actual, pct: planned > 0 ? Math.min(1, actual / planned) : 0 };
  }, [budgetRows]);

  const visibleRows = showAllBudgetRows ? budgetRows : budgetRows.slice(0, VISIBLE_BUDGET_ROWS);
  const hiddenCount = budgetRows.length - visibleRows.length;

  // Income vs Expected ------------------------------------------------------------
  const incomeCashflowIds = useMemo(
    () => new Set(activeCashflows.filter((c) => c.kind === "income").map((c) => c.id)),
    [activeCashflows]
  );

  const incomeExpected = useMemo(
    () => [...incomeCashflowIds].reduce((sum, id) => sum + (plannedByCashflowId.get(id) ?? 0), 0),
    [incomeCashflowIds, plannedByCashflowId]
  );

  const incomeActual = useMemo(
    () => [...incomeCashflowIds].reduce((sum, id) => sum + (actualByCashflowId.get(id) ?? 0), 0),
    [incomeCashflowIds, actualByCashflowId]
  );

  // Cash flow trend (actual, last 6 months) ----------------------------------------
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
      for (const tx of transactions) {
        if (!isInMonth(tx.date, key)) continue;
        if (tx.amount < 0) inflow += Math.abs(tx.amount);
        else outflow += tx.amount;
      }
      return { label: formatShortMonthLabel(key), net: inflow - outflow, inflow, outflow };
    });
  }, [transactions, monthKey]);

  const currentMonthCashFlow = cashFlowTrend[cashFlowTrend.length - 1] ?? { inflow: 0, outflow: 0, net: 0 };

  // Needs review ---------------------------------------------------------------------
  const needsReviewTransactions = useMemo(
    () =>
      transactions
        .filter((tx) => tx.assignmentType === "unassigned")
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 5),
    [transactions]
  ) as Transaction[];
  const needsReviewTotal = useMemo(
    () => transactions.filter((tx) => tx.assignmentType === "unassigned").length,
    [transactions]
  );

  // Recent transactions ---------------------------------------------------------------
  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5),
    [transactions]
  ) as Transaction[];

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);

  const isLoading = authLoading || rangeLoading || transactionsLoading;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "20px", bgcolor: "#f8fafc", minHeight: "100vh", fontFamily: "Inter, sans-serif", p: 4 }}>
      {/* Header */}
      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: "12px" }}>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em", color: "#0f172a", fontSize: "1.75rem" }}>
          Dashboard
        </Typography>
        <MonthPickerControl monthKey={monthKey} onChange={setMonthKey} showStepButtons />
      </Box>

      {isLoading ? (
        <Card variant="outlined" sx={CARD_SX}>
          <CardContent sx={{ p: "20px" }}>
            <Typography variant="body2" color="text.secondary">Loading...</Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Net worth */}
          <Card variant="outlined" sx={CARD_SX}>
            <CardContent sx={{ p: "20px" }}>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" }, gap: "24px" }}>
                <Box>
                  <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Net Worth</Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: "1.9rem", color: "#0f172a", letterSpacing: "-0.02em" }}>
                    {formatCurrency(netWorth.total)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                    Assets {formatCurrency(netWorth.assets)} &nbsp;–&nbsp; Liabilities {formatCurrency(netWorth.debt)}
                  </Typography>
                </Box>

                <Box sx={{ display: { xs: "none", md: "block" }, width: "1px", alignSelf: "stretch", bgcolor: "#e2e8f0" }} />

                <Box sx={{ display: "flex", flexDirection: "row", gap: "32px", flexWrap: "wrap", rowGap: "16px" }}>
                  <InlineStat label="Cash" value={formatCurrency(netWorth.cash)} icon={<AccountBalanceRoundedIcon sx={{ fontSize: 16 }} />} bg="#f0fdf4" color="#16a34a" />
                  <InlineStat label="Investments" value={formatCurrency(netWorth.investments)} icon={<TrendingUpRoundedIcon sx={{ fontSize: 16 }} />} bg="#eff6ff" color="#2563eb" />
                  <InlineStat label="Debt" value={formatCurrency(-netWorth.debt)} icon={<TrendingDownRoundedIcon sx={{ fontSize: 16 }} />} bg="#fef2f2" color="#dc2626" valueColor="#dc2626" />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Budget vs Actual — hero */}
          <Card variant="outlined" sx={CARD_SX}>
            <CardContent sx={{ p: "24px" }}>
              <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", rowGap: "8px" }}>
                <Typography sx={{ fontWeight: 700, fontSize: "1.2rem", color: "#0f172a", letterSpacing: "-0.02em" }}>
                  {formatMonthLabel(monthKey)} Budget
                </Typography>
                <Typography variant="body2" sx={{ color: "#64748b" }}>
                  {formatCurrency(heroTotals.actual)} of {formatCurrency(heroTotals.planned)} spent
                  {" · "}
                  <Box component="span" sx={{ fontWeight: 700, color: "#0f172a" }}>{Math.round(heroTotals.pct * 100)}%</Box>
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={Math.round(heroTotals.pct * 100)}
                sx={{
                  mt: 1.5, mb: 3, height: 8, borderRadius: 4, bgcolor: "#f1f5f9",
                  "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: heroTotals.pct > 1 ? "#dc2626" : "#2563eb" },
                }}
              />

              {budgetRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No budgeted expenses for this month yet.</Typography>
              ) : (
                <>
                  {/* Column header row */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr 160px 90px 90px 90px 120px",
                      gap: "12px",
                      pb: 1.5,
                    }}
                  >
                    {["CASHFLOW", "", "SPENT", "BUDGET", "% OF BUDGET", "VS. PACE"].map((label, i) => (
                      <Typography key={i} variant="caption" sx={{ color: "#94a3b8", fontWeight: 700, letterSpacing: "0.04em", textAlign: i >= 2 ? "right" : "left" }}>
                        {label}
                      </Typography>
                    ))}
                  </Box>

                  <Box sx={{ display: "flex", flexDirection: "column" }}>
                    {visibleRows.map((row) => (
                      <BudgetRow key={row.cashflow.id} row={row} />
                    ))}
                  </Box>
                </>
              )}

              <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
                {hiddenCount > 0 ? (
                  <Link href="/budgets" style={{ textDecoration: "none" }}>
                    <Typography variant="body2" sx={{ color: "#2563eb", fontWeight: 600, cursor: "pointer" }} onClick={(e) => { e.preventDefault(); setShowAllBudgetRows((v) => !v); }}>
                      {showAllBudgetRows ? "Show less" : `+ ${hiddenCount} more cashflows`}
                    </Typography>
                  </Link>
                ) : (
                  <Box />
                )}
                <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "4px" }}>
                  <Typography component={Link} href="/budgets" variant="body2" sx={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
                    View full budget
                  </Typography>
                  <ArrowForwardRoundedIcon sx={{ fontSize: 15, color: "#2563eb" }} />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Cash Flow / Income vs Expected / Needs Review */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", lg: "repeat(3, minmax(0, 1fr))" }, gap: "16px", alignItems: "stretch" }}>
            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1rem" }}>Cash Flow (This Month)</Typography>
                <Box sx={{ display: "flex", flexDirection: "row", gap: "24px", mt: 2 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Income</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.15rem", color: "#16a34a" }}>{formatCurrency(currentMonthCashFlow.inflow)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Expenses</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.15rem", color: "#dc2626" }}>{formatCurrency(currentMonthCashFlow.outflow)}</Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Net Cash Flow</Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: "1.3rem", color: currentMonthCashFlow.net >= 0 ? "#16a34a" : "#dc2626" }}>
                    {currentMonthCashFlow.net >= 0 ? "+" : ""}{formatCurrency(currentMonthCashFlow.net)}
                  </Typography>
                </Box>
                <Box sx={{ width: "100%", minWidth: 0, height: 70, mt: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cashFlowTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <Line type="monotone" dataKey="net" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: "#2563eb", strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                <FooterLink href="/transactions" label="View cash flow report" />
              </CardContent>
            </Card>

            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1rem" }}>Income vs Expected</Typography>
                <Box sx={{ display: "flex", flexDirection: "row", gap: "24px", mt: 2 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Expected</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.15rem", color: "#0f172a" }}>{formatCurrency(incomeExpected)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Actual</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.15rem", color: "#16a34a" }}>{formatCurrency(incomeActual)}</Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600 }}>Difference</Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: "1.3rem", color: incomeActual - incomeExpected >= 0 ? "#16a34a" : "#dc2626" }}>
                    {incomeActual - incomeExpected >= 0 ? "+" : ""}{formatCurrency(incomeActual - incomeExpected)}
                  </Typography>
                </Box>
                <FooterLink href="/budgets" label="View details" />
              </CardContent>
            </Card>

            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1rem" }}>Needs Review</Typography>
                  {needsReviewTotal > 0 && (
                    <Chip size="small" label={needsReviewTotal} sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700, borderRadius: "6px", bgcolor: "#fef2f2", color: "#dc2626" }} />
                  )}
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", gap: "12px", mt: 2 }}>
                  {needsReviewTransactions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Everything is categorized.</Typography>
                  ) : (
                    needsReviewTransactions.map((tx) => (
                      <Box key={tx.id} sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          <Avatar sx={{ width: 26, height: 26, bgcolor: "#f1f5f9", color: "#64748b" }}>
                            <StorefrontOutlinedIcon sx={{ fontSize: 14 }} />
                          </Avatar>
                          <Typography variant="body2" sx={{ color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {tx.displayName}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", ml: 1 }}>
                          {formatCurrency(Math.abs(tx.amount))}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
                <FooterLink href="/transactions" label="View all" />
              </CardContent>
            </Card>

          </Box>

          {/* Recent Transactions + Accounts */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "16px" }}>
            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1rem" }}>Recent Transactions</Typography>
                  <Typography component={Link} href="/transactions" variant="body2" sx={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
                    View all
                  </Typography>
                </Box>
                <Box sx={{ mt: 1 }}>
                  {recentTransactions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No transactions yet.</Typography>
                  ) : (
                    recentTransactions.map((tx) => (
                      <Box
                        key={tx.id}
                        sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", py: "12px", borderBottom: "1px solid #f1f5f9", "&:last-child": { borderBottom: "none" } }}
                      >
                        <Typography variant="caption" sx={{ color: "#94a3b8", width: 78, flexShrink: 0 }}>{formatLongDate(tx.date)}</Typography>
                        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                          <Avatar sx={{ width: 30, height: 30, bgcolor: "#f1f5f9", color: "#64748b" }}>
                            <StorefrontOutlinedIcon sx={{ fontSize: 16 }} />
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {tx.displayName}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#94a3b8" }}>{tx.categoryPrimary ?? tx.originAccName}</Typography>
                          </Box>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap", ml: 1, color: tx.amount > 0 ? "#dc2626" : "#16a34a" }}>
                          {tx.amount > 0 ? `-${formatCurrency(tx.amount)}` : `+${formatCurrency(Math.abs(tx.amount))}`}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1rem" }}>Accounts</Typography>
                  <Typography component={Link} href="/accounts" variant="body2" sx={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
                    Add account
                  </Typography>
                </Box>
                <Box sx={{ mt: 1 }}>
                  {activeAccounts.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No accounts linked yet.</Typography>
                  ) : (
                    activeAccounts.map((account) => {
                      const visual = getAccountVisual(account);
                      const syncLabel = formatRelativeSync(account);
                      return (
                        <Box
                          key={account.id}
                          sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", py: "12px", borderBottom: "1px solid #f1f5f9", "&:last-child": { borderBottom: "none" } }}
                        >
                          <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            <Avatar sx={{ width: 30, height: 30, bgcolor: visual.bg, color: visual.color }}>{visual.icon}</Avatar>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a" }}>{account.name}</Typography>
                              <Typography variant="caption" sx={{ color: "#94a3b8" }}>{accountTypeLabel(account.accountType)}</Typography>
                            </Box>
                          </Box>
                          <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "12px" }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: account.normalBalance === "liability" ? "#dc2626" : "#0f172a" }}>
                              {account.normalBalance === "liability" ? "-" : ""}{formatCurrency(Math.abs(account.currentBalance ?? 0))}
                            </Typography>
                            {syncLabel && <Typography variant="caption" sx={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{syncLabel}</Typography>}
                          </Box>
                        </Box>
                      );
                    })
                  )}
                </Box>
                <FooterLink href="/accounts" label="View all accounts" />
              </CardContent>
            </Card>
          </Box>

          <Typography variant="caption" sx={{ color: "#cbd5e1", textAlign: "center" }}>
            All amounts are in USD
          </Typography>
        </>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Small presentational subcomponents
// ---------------------------------------------------------------------------

function InlineStat({
  label, value, icon, bg, color, valueColor,
}: { label: string; value: string; icon: ReactNode; bg: string; color: string; valueColor?: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px" }}>
      <Box sx={{ width: 30, height: 30, borderRadius: "50%", bgcolor: bg, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 600, display: "block" }}>{label}</Typography>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: valueColor ?? "#0f172a" }}>{value}</Typography>
      </Box>
    </Box>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "4px", mt: 2 }}>
      <Typography component={Link} href={href} variant="body2" sx={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
        {label}
      </Typography>
      <ArrowForwardRoundedIcon sx={{ fontSize: 14, color: "#2563eb" }} />
    </Box>
  );
}

type BudgetStatus = {
  label: string;
  bg: string;
  color: string;
  icon: ReactElement | null;
};

type BudgetRowData = { cashflow: Cashflow; planned: number; actual: number; pct: number };

function BudgetRow({ row }: { row: BudgetRowData }) {
  const visual = getCashflowVisual(row.cashflow);
  const hasPlan = row.planned > 0;
  const status = getBudgetStatus(row.pct, hasPlan) as BudgetStatus;
  const barPct = hasPlan ? Math.min(1, row.actual / row.planned) : row.actual > 0 ? 1 : 0;
  const barColor = row.pct > 1 ? "#dc2626" : row.pct >= 0.9 ? "#d97706" : "#2563eb";
  const pctColor = hasPlan && row.pct >= 0.9 ? "#dc2626" : "#16a34a";

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 160px 90px 90px 90px 120px",
        gap: "12px",
        alignItems: "center",
        py: "14px",
        borderBottom: "1px solid #f1f5f9",
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: visual.bg, color: visual.color }}>{visual.icon}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a" }}>{row.cashflow.name}</Typography>
          {row.cashflow.description && (
            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.cashflow.description}
            </Typography>
          )}
        </Box>
      </Box>

      <LinearProgress
        variant="determinate"
        value={Math.round(barPct * 100)}
        sx={{ height: 6, borderRadius: 3, bgcolor: "#f1f5f9", "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: barColor } }}
      />

      <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a", textAlign: "right" }}>{formatCurrency(row.actual)}</Typography>
      <Typography variant="body2" sx={{ color: "#64748b", textAlign: "right" }}>{formatCurrency(row.planned)}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, color: pctColor, textAlign: "right" }}>
        {hasPlan ? `${Math.round(Math.min(row.pct, 9.99) * 100)}%` : "—"}
      </Typography>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Chip
          size="small"
          icon={status.icon ?? undefined}
          label={status.label}
          sx={{ height: 22, fontSize: "0.7rem", fontWeight: 700, borderRadius: "6px", bgcolor: status.bg, color: status.color }}
        />
      </Box>
    </Box>
  );
}