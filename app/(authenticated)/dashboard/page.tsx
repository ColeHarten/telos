"use client";

import { MonthPickerControl, formatMonthLabel } from "@/components/MonthPickerControl";
import {
  accountBalance,
  archivedCategoryActuals,
  categoryActuals,
  getCurrentMonthKey,
  monthCashFlow,
  monthKeysEndingAt,
  netWorth as computeNetWorth,
  plannedAmount,
  shiftMonthKey,
} from "@/lib/budgetCalculations";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import useCategories from "@/lib/hooks/useCategories";
import useTransactions from "@/lib/hooks/useTransactions";
import { formatCurrency } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";

import { Box, Card, CardContent, Chip, LinearProgress, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis } from "recharts";
import type { Account, Transaction } from "@/lib/types/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWithinLast30Days(dateStr: string) {
  const transactionDate = new Date(`${dateStr}T00:00:00`);
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - 29);

  return transactionDate >= startDate;
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

function accountTypeLabel(accountType: string) {
  return accountType.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const INK = "#0f172a";
const SUB = "#64748b";
const MUTED = "#94a3b8";
const BORDER = "#e7eaef";
const POSITIVE = "#16a34a";
const NEGATIVE = "#dc2626";
const ACCENT = "#2563eb";

const CARD_SX = { borderRadius: "14px", borderColor: BORDER, bgcolor: "#fff", boxShadow: "none" } as const;

export default function DashboardPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [] } = useAccounts(user, authLoading);
  const { categories = [] } = useCategories(user, authLoading);
  const { rangeBudgets, rangeLoading, loadBudgetRange } = useBudget(user, authLoading);
  const [monthKey, setMonthKey] = useState<string>(() => getCurrentMonthKey());
  // Loads far enough back to cover the six-month trend.
  const { transactions = [], transactionsLoading } = useTransactions(
    user,
    authLoading,
    accounts,
    shiftMonthKey(monthKey, -5)
  );

  useEffect(() => {
    if (authLoading || !user) return;
    loadBudgetRange(monthKey, monthKey).catch(() => {});
  }, [authLoading, user, monthKey, loadBudgetRange]);

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const activeCategories = useMemo(() => categories.filter((c) => !c.isArchived), [categories]);

  // Net worth -----------------------------------------------------------------
  const netWorth = useMemo(() => computeNetWorth(accounts), [accounts]);

  // Planned amounts for the selected month: saved lines, else the category's estimate.
  const plannedByCategoryId = useMemo(() => {
    const lines: Readonly<Record<string, { planned?: number }>> = rangeBudgets?.[monthKey] ?? {};
    return new Map(activeCategories.map((category) => [category.id, plannedAmount(category, lines)]));
  }, [rangeBudgets, monthKey, activeCategories]);

  // Category actuals for the month, net of refunds.
  const actualByCategoryId = useMemo(
    () => categoryActuals(transactions, categoriesById, monthKey),
    [transactions, categoriesById, monthKey]
  );

  // Archived categories still count toward the month's totals.
  const archivedActuals = useMemo(
    () => archivedCategoryActuals(transactions, categoriesById, actualByCategoryId, monthKey),
    [transactions, categoriesById, actualByCategoryId, monthKey]
  );

  // Budget snapshot — totals only. The full category-by-category breakdown
  // lives on the Budgets page; this card intentionally doesn't repeat it.
  const expenseCategoryIds = useMemo(
    () => activeCategories.filter((c) => c.kind === "expense").map((c) => c.id),
    [activeCategories]
  );

  const heroTotals = useMemo(() => {
    const planned = expenseCategoryIds.reduce((sum, id) => sum + (plannedByCategoryId.get(id) ?? 0), 0);
    const actual =
      archivedActuals.expense + expenseCategoryIds.reduce((sum, id) => sum + (actualByCategoryId.get(id) ?? 0), 0);
    return { planned, actual, pct: planned > 0 ? Math.min(1, actual / planned) : actual > 0 ? 1 : 0 };
  }, [expenseCategoryIds, plannedByCategoryId, actualByCategoryId, archivedActuals]);

  const incomeCategoryIds = useMemo(
    () => activeCategories.filter((c) => c.kind === "income").map((c) => c.id),
    [activeCategories]
  );

  const incomeExpected = useMemo(
    () => incomeCategoryIds.reduce((sum, id) => sum + (plannedByCategoryId.get(id) ?? 0), 0),
    [incomeCategoryIds, plannedByCategoryId]
  );

  const incomeActual = useMemo(
    () => archivedActuals.income + incomeCategoryIds.reduce((sum, id) => sum + (actualByCategoryId.get(id) ?? 0), 0),
    [incomeCategoryIds, actualByCategoryId, archivedActuals]
  );

  const netThisMonth = incomeActual - heroTotals.actual;

  // Cash flow trend (actual, last 6 months), excluding transfers.
  const cashFlowTrend = useMemo(
    () =>
      monthKeysEndingAt(monthKey, 6).map((key) => ({
        label: formatShortMonthLabel(key),
        ...monthCashFlow(transactions, key),
      })),
    [transactions, monthKey]
  );

  const currentMonthCashFlow = cashFlowTrend[cashFlowTrend.length - 1] ?? { inflow: 0, outflow: 0, net: 0 };

  // Needs review — "uncategorized" means categoryKind is undefined, not the
  // string "uncategorized" (there is no such CategoryKind value).
  const needsReviewTransactions = useMemo(
    () =>
      transactions
        .filter((tx) => !tx.categoryKind)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 5),
    [transactions]
  ) as Transaction[];
  const needsReviewTotal = useMemo(
    () => transactions.filter((tx) => !tx.categoryKind).length,
    [transactions]
  );

  // Recent transactions ---------------------------------------------------------------
  const recentTransactions = useMemo(
    () => [...transactions].filter((tx) => isWithinLast30Days(tx.date)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions]
  ) as Transaction[];

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);

  const isLoading = authLoading || rangeLoading || transactionsLoading;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "20px", bgcolor: "#f8fafc", minHeight: "100vh", p: 4 }}>
      {/* Header */}
      <PageHeader title="Dashboard">
        <MonthPickerControl monthKey={monthKey} onChange={setMonthKey} showStepButtons />
      </PageHeader>

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
            <CardContent sx={{ p: "24px" }}>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" }, gap: "28px" }}>
                <Box sx={{ minWidth: 200 }}>
                  <Typography variant="body2" sx={{ color: SUB, fontWeight: 500, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Net Worth
                  </Typography>
                  <Typography sx={{ fontWeight: 600, fontSize: "2rem", color: INK, letterSpacing: "-0.02em", mt: 0.5 }}>
                    {formatCurrency(netWorth.total)}
                  </Typography>
                </Box>

                <Box sx={{ display: { xs: "none", md: "block" }, width: "1px", alignSelf: "stretch", bgcolor: BORDER }} />

                <Box sx={{ display: "flex", flexDirection: "row", gap: "36px", flexWrap: "wrap", rowGap: "16px" }}>
                  <InlineStat label="Cash" value={formatCurrency(netWorth.cash)} />
                  <InlineStat label="Investments" value={formatCurrency(netWorth.investments)} />
                  <InlineStat label="Debt" value={formatCurrency(-netWorth.debt)} valueColor={NEGATIVE} />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Budget snapshot — totals only. Category-by-category detail lives
              on /budgets; this card links there instead of repeating it. */}
          <Card variant="outlined" sx={CARD_SX}>
            <CardContent sx={{ p: "24px" }}>
              <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", rowGap: "8px" }}>
                <Typography sx={{ fontWeight: 600, fontSize: "1.1rem", color: INK, letterSpacing: "-0.01em" }}>
                  {formatMonthLabel(monthKey)} Budget
                </Typography>
                <Typography variant="body2" sx={{ color: SUB }}>
                  {formatCurrency(heroTotals.actual)} of {formatCurrency(heroTotals.planned)} spent
                  {" · "}
                  <Box component="span" sx={{ fontWeight: 600, color: INK }}>{Math.round(heroTotals.pct * 100)}%</Box>
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={Math.round(heroTotals.pct * 100)}
                sx={{
                  mt: 1.5, mb: 3, height: 6, borderRadius: 3, bgcolor: "#f1f5f9",
                  "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: heroTotals.pct >= 1 ? NEGATIVE : ACCENT },
                }}
              />

              <Box sx={{ display: "flex", flexDirection: "row", gap: "36px", flexWrap: "wrap", rowGap: "16px" }}>
                <InlineStat label="Income (Actual / Expected)" value={`${formatCurrency(incomeActual)} / ${formatCurrency(incomeExpected)}`} />
                <InlineStat label="Net This Month" value={`${netThisMonth >= 0 ? "+" : ""}${formatCurrency(netThisMonth)}`} valueColor={netThisMonth >= 0 ? POSITIVE : NEGATIVE} />
              </Box>

              <FooterLink href="/budgets" label="View full budget" />
            </CardContent>
          </Card>

          {/* Cash Flow / Needs Review */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "16px", alignItems: "stretch" }}>
            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Typography sx={{ fontWeight: 600, color: INK, fontSize: "0.95rem" }}>Cash Flow (This Month)</Typography>
                <Box sx={{ display: "flex", flexDirection: "row", gap: "24px", mt: 2 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: SUB, fontWeight: 500 }}>Income</Typography>
                    <Typography sx={{ fontWeight: 600, fontSize: "1.1rem", color: POSITIVE }}>{formatCurrency(currentMonthCashFlow.inflow)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: SUB, fontWeight: 500 }}>Expenses</Typography>
                    <Typography sx={{ fontWeight: 600, fontSize: "1.1rem", color: NEGATIVE }}>{formatCurrency(currentMonthCashFlow.outflow)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: SUB, fontWeight: 500 }}>Net</Typography>
                    <Typography sx={{ fontWeight: 600, fontSize: "1.1rem", color: currentMonthCashFlow.net >= 0 ? POSITIVE : NEGATIVE }}>
                      {currentMonthCashFlow.net >= 0 ? "+" : ""}{formatCurrency(currentMonthCashFlow.net)}
                    </Typography>
                  </Box>
                </Box>

                {/* minWidth/minHeight on ResponsiveContainer + guarded against an
                    empty dataset + flexShrink:0 on the wrapper so it can never
                    collapse to 0 inside its flow (source of the -1/-1 warning). */}
                <Box sx={{ width: "100%", minWidth: 1, height: 70, mt: 2, flexShrink: 0 }}>
                  {cashFlowTrend.length > 0 && (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={1}
                      minHeight={1}
                      initialDimension={{ width: 1, height: 70 }}
                    >
                      <LineChart data={cashFlowTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} axisLine={false} tickLine={false} />
                        <Line type="monotone" dataKey="net" stroke={ACCENT} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Box>
                <FooterLink href="/transactions" label="View cash flow report" />
              </CardContent>
            </Card>

            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography sx={{ fontWeight: 600, color: INK, fontSize: "0.95rem" }}>Needs Review</Typography>
                  {needsReviewTotal > 0 && (
                    <Chip size="small" label={needsReviewTotal} sx={{ height: 20, fontSize: "0.7rem", fontWeight: 600, borderRadius: "6px", bgcolor: "#fef2f2", color: NEGATIVE }} />
                  )}
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", mt: 2 }}>
                  {needsReviewTransactions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Everything is categorized.</Typography>
                  ) : (
                    needsReviewTransactions.map((tx, i) => (
                      <Box
                        key={tx.id}
                        sx={{
                          display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                          py: "10px", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                        }}
                      >
                        <Typography variant="body2" sx={{ color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pr: 1 }}>
                          {tx.displayName}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: INK, whiteSpace: "nowrap" }}>
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
                  <Typography sx={{ fontWeight: 600, color: INK, fontSize: "0.95rem" }}>Recent Transactions</Typography>
                </Box>
                <Box sx={{ mt: 1, maxHeight: 310, overflowY: "auto", pr: 0.5 }}>
                  {recentTransactions.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No transactions yet.</Typography>
                  ) : (
                    recentTransactions.map((tx, i) => (
                      <Box
                        key={tx.id}
                        sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", py: "12px", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {tx.displayName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: MUTED, width: 76, flexShrink: 0 }}>{formatLongDate(tx.date)}</Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap", ml: 1, color: tx.amount > 0 ? NEGATIVE : POSITIVE }}>
                          {tx.amount > 0 ? `-${formatCurrency(tx.amount)}` : `+${formatCurrency(Math.abs(tx.amount))}`}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
                <FooterLink href="/accounts" label="View all" />
              </CardContent>
            </Card>

            <Card variant="outlined" sx={CARD_SX}>
              <CardContent sx={{ p: "20px" }}>
                <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography sx={{ fontWeight: 600, color: INK, fontSize: "0.95rem" }}>Accounts</Typography>
                  <FooterLink href="/accounts" label="Add account" compact />
                </Box>
                <Box sx={{ mt: 1, maxHeight: 310, overflowY: "auto", pr: 0.5 }}>
                  {activeAccounts.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No accounts linked yet.</Typography>
                  ) : (
                    activeAccounts.map((account, i) => {
                      const syncLabel = formatRelativeSync(account);
                      return (
                        <Box
                          key={account.id}
                          sx={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", py: "12px", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: INK }}>{account.name}</Typography>
                            <Typography variant="caption" sx={{ color: MUTED }}>{accountTypeLabel(account.accountType)}                             {syncLabel && <Typography variant="caption" sx={{ color: MUTED, whiteSpace: "nowrap" }}> · Last updated {syncLabel}</Typography>}</Typography>
                          </Box>
                          <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "12px" }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: account.normalBalance === "liability" ? NEGATIVE : INK }}>
                              {account.normalBalance === "liability" ? "-" : ""}{formatCurrency(Math.abs(accountBalance(account)))}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })
                  )}
                </Box>
                <FooterLink href="/accounts" label="View all" />
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Small presentational subcomponents
// ---------------------------------------------------------------------------

function InlineStat({
  label, value, valueColor,
}: { label: string; value: string; valueColor?: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: SUB, fontWeight: 500, display: "block" }}>{label}</Typography>
      <Typography sx={{ fontWeight: 600, fontSize: "1rem", color: valueColor ?? INK, mt: 0.25 }}>{value}</Typography>
    </Box>
  );
}

function FooterLink({ href, label, compact }: { href: string; label: string; compact?: boolean }) {
  return (
    <Typography
      component={Link}
      href={href}
      variant="body2"
      sx={{
        color: ACCENT, fontWeight: 500, textDecoration: "none",
        display: "inline-block", mt: compact ? 0 : 2.5,
        "&:hover": { textDecoration: "underline" },
      }}
    >
      {label}
    </Typography>
  );
}