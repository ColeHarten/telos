"use client";

import { MonthPickerControl, formatMonthLabel } from "@/components/MonthPickerControl";
import {
  accountBalance,
  archivedCategoryActuals,
  categoryActuals,
  getCurrentMonthKey,
  monthCashFlow,
  monthKeysEndingAt,
  needsReview,
  netWorth as computeNetWorth,
  plannedAmount,
  shiftMonthKey,
} from "@/lib/budgetCalculations";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import useCategories from "@/lib/hooks/useCategories";
import useRules from "@/lib/hooks/useRules";
import useTransactions from "@/lib/hooks/useTransactions";
import { toDateOrNull } from "@/lib/connections";
import { formatCurrency, formatSignedCurrency } from "@/lib/utils";
import EmptyState from "@/components/EmptyState";
import { CardsSkeleton } from "@/components/LoadingSkeleton";
import MerchantAvatar from "@/components/MerchantAvatar";
import PageHeader from "@/components/PageHeader";
import TransactionAmount from "@/components/TransactionAmount";
import { colors, slate } from "@/app/theme";
import SetupChecklist, { type SetupStep } from "./SetupChecklist";

import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { Box, Button, Card, CardContent, Divider, LinearProgress, Stack, Typography } from "@mui/material";
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

// How long ago a linked account's balance came from the bank; "Manual" for
// manual accounts, or nothing when no time is known.
function formatRelativeSync(account: Account): string | null {
  if (account.isManual) return "Manual";
  const date = toDateOrNull(account.balanceUpdatedAt ?? account.updatedAt);
  if (!date) return null;

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

// Card padding: tighter on phones.
const CARD_CONTENT_SX = { p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } } as const;

export default function DashboardPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [] } = useAccounts(user, authLoading);
  const { categories = [] } = useCategories(user, authLoading);
  const { rules, rulesLoading } = useRules(user, authLoading);
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

  // Needs review: uncategorized, not hidden, and not a recognized transfer.
  const needsReviewTransactions = useMemo(
    () =>
      transactions
        .filter(needsReview)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 5),
    [transactions]
  ) as Transaction[];
  const needsReviewTotal = useMemo(
    () => transactions.filter(needsReview).length,
    [transactions]
  );

  // Recent transactions ---------------------------------------------------------------
  const recentTransactions = useMemo(
    () => [...transactions].filter((tx) => isWithinLast30Days(tx.date)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions]
  ) as Transaction[];

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);

  // Getting started, shown until every step is done once.
  const setupSteps: SetupStep[] = [
    {
      label: "Set up categories",
      detail: "Start with the starter set, or make your own.",
      done: activeCategories.length > 0,
      href: "/categories",
    },
    {
      label: "Add rules",
      detail: "Rules categorize, rename, or hide new transactions as they arrive.",
      done: rules.length > 0,
      href: "/rules",
    },
    {
      label: "Connect your first bank",
      detail: "Start with your least important bank, and link each login once.",
      done: accounts.some((account) => !account.isManual),
      href: "/accounts",
    },
    {
      label: "Review new transactions",
      detail: "Categorize what your rules didn't, once your history has imported.",
      done: transactions.length > 0 && needsReviewTotal === 0,
      href: "/transactions",
    },
    {
      label: "Plan a budget",
      detail: "Set monthly estimates on your categories, or plan this month on Budgets.",
      done:
        activeCategories.some((category) => Number(category.estimatedMonthly) > 0) ||
        Object.keys(rangeBudgets?.[monthKey] ?? {}).length > 0,
      href: "/budgets",
    },
  ];

  const isLoading = authLoading || rangeLoading || transactionsLoading || rulesLoading;
  const overBudget = heroTotals.actual > heroTotals.planned;

  return (
    <Stack spacing={3}>
      <PageHeader title="Dashboard">
        <MonthPickerControl monthKey={monthKey} onChange={setMonthKey} showStepButtons />
      </PageHeader>

      {isLoading ? (
        <CardsSkeleton heights={[112, 200, 260]} />
      ) : (
        <>
          <SetupChecklist steps={setupSteps} />

          {/* Net worth */}
          <Card>
            <CardContent sx={CARD_CONTENT_SX}>
              <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" }, gap: { xs: 2, md: 3.5 } }}>
                <Box sx={{ minWidth: 200 }}>
                  <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
                    Net worth
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: { xs: "1.75rem", md: "2rem" }, letterSpacing: "-0.03em", lineHeight: 1.2, mt: 0.5 }}>
                    {formatCurrency(netWorth.total)}
                  </Typography>
                </Box>

                <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />

                <Box sx={{ display: "flex", gap: 4.5, rowGap: 2, flexWrap: "wrap" }}>
                  <InlineStat label="Cash" value={formatCurrency(netWorth.cash)} />
                  <InlineStat label="Investments" value={formatCurrency(netWorth.investments)} />
                  <InlineStat label="Debt" value={formatCurrency(-netWorth.debt)} />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Budget snapshot: totals only. The category detail lives on Budgets. */}
          <Card>
            <CardContent sx={CARD_CONTENT_SX}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", columnGap: 2, rowGap: 0.5 }}>
                <CardTitle>{formatMonthLabel(monthKey)} budget</CardTitle>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {formatCurrency(heroTotals.actual)} of {formatCurrency(heroTotals.planned)} spent
                  {" · "}
                  <Box component="span" sx={{ fontWeight: 600, color: overBudget ? "error.main" : "text.primary" }}>
                    {Math.round(heroTotals.pct * 100)}%
                  </Box>
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                color={overBudget ? "error" : "primary"}
                value={Math.round(heroTotals.pct * 100)}
                sx={{ mt: 1.5, mb: 2.5, height: 6 }}
              />

              <Box sx={{ display: "flex", gap: 4.5, rowGap: 2, flexWrap: "wrap" }}>
                <InlineStat label="Income (actual / expected)" value={`${formatCurrency(incomeActual)} / ${formatCurrency(incomeExpected)}`} />
                <InlineStat
                  label="Net this month"
                  value={formatSignedCurrency(netThisMonth)}
                  tone={netThisMonth > 0 ? "positive" : netThisMonth < 0 ? "negative" : undefined}
                />
              </Box>

              <FooterLink href="/budgets" label="View full budget" />
            </CardContent>
          </Card>

          {/* Cash flow and Needs review */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, alignItems: "stretch" }}>
            <Card>
              <CardContent sx={CARD_CONTENT_SX}>
                <CardTitle>Cash flow this month</CardTitle>
                <Box sx={{ display: "flex", gap: 3, mt: 2, flexWrap: "wrap" }}>
                  <InlineStat label="Money in" value={formatCurrency(currentMonthCashFlow.inflow)} tone="positive" />
                  <InlineStat label="Money out" value={formatCurrency(currentMonthCashFlow.outflow)} />
                  <InlineStat
                    label="Net"
                    value={formatSignedCurrency(currentMonthCashFlow.net)}
                    tone={currentMonthCashFlow.net > 0 ? "positive" : currentMonthCashFlow.net < 0 ? "negative" : undefined}
                  />
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
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: slate[400] }} axisLine={false} tickLine={false} />
                        <Line type="monotone" dataKey="net" stroke={colors.primary} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Box>
                <FooterLink href="/transactions" label="View transactions" />
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={CARD_CONTENT_SX}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                  <CardTitle>Needs review</CardTitle>
                  {needsReviewTotal > 0 && <CountPill count={needsReviewTotal} />}
                </Box>
                {needsReviewTransactions.length === 0 ? (
                  <EmptyState
                    dense
                    icon={<CheckCircleOutlineRoundedIcon />}
                    title="All caught up"
                    description="Every transaction has a category."
                  />
                ) : (
                  <Box sx={{ mt: 1 }}>
                    {needsReviewTransactions.map((tx, i) => (
                      <TransactionLine key={tx.id} tx={tx} first={i === 0} />
                    ))}
                  </Box>
                )}
                {needsReviewTransactions.length > 0 && <FooterLink href="/transactions" label="Review all" />}
              </CardContent>
            </Card>
          </Box>

          {/* Recent transactions and accounts */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Card>
              <CardContent sx={CARD_CONTENT_SX}>
                <CardTitle>Recent transactions</CardTitle>
                {recentTransactions.length === 0 ? (
                  <EmptyState
                    dense
                    icon={<ReceiptLongOutlinedIcon />}
                    title="Nothing in the last 30 days"
                    description="New transactions show up here after each sync."
                  />
                ) : (
                  <Box sx={{ mt: 1, maxHeight: 310, overflowY: "auto", pr: 0.5 }}>
                    {recentTransactions.map((tx, i) => (
                      <TransactionLine key={tx.id} tx={tx} first={i === 0} showDate />
                    ))}
                  </Box>
                )}
                {recentTransactions.length > 0 && <FooterLink href="/transactions" label="View all" />}
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={CARD_CONTENT_SX}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <CardTitle>Accounts</CardTitle>
                  {activeAccounts.length > 0 && <FooterLink href="/accounts" label="Add account" compact />}
                </Box>
                {activeAccounts.length === 0 ? (
                  <EmptyState
                    dense
                    icon={<AccountBalanceOutlinedIcon />}
                    title="No accounts yet"
                    description="Connect a bank, or add an account by hand."
                    action={
                      <Button component={Link} href="/accounts" variant="contained" size="small">
                        Add account
                      </Button>
                    }
                  />
                ) : (
                  <Box sx={{ mt: 1, maxHeight: 310, overflowY: "auto", pr: 0.5 }}>
                    {activeAccounts.map((account, i) => {
                      const syncLabel = formatRelativeSync(account);
                      const liability = account.normalBalance === "liability";
                      return (
                        <Box
                          key={account.id}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1.5,
                            py: 1.5,
                            borderTop: i === 0 ? "none" : "1px solid",
                            borderColor: "grey.100",
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                              {account.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {accountTypeLabel(account.accountType)}
                              {syncLabel && ` · ${syncLabel === "Manual" ? "Manual" : `Updated ${syncLabel.toLowerCase()}`}`}
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                            {formatCurrency(liability ? -Math.abs(accountBalance(account)) : Math.abs(accountBalance(account)))}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
                {activeAccounts.length > 0 && <FooterLink href="/accounts" label="View all" />}
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Small presentational subcomponents
// ---------------------------------------------------------------------------

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.01em" }}>
      {children}
    </Typography>
  );
}

function InlineStat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 500, display: "block" }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: 600,
          fontSize: "1.05rem",
          mt: 0.25,
          color: tone === "positive" ? "success.main" : tone === "negative" ? "error.main" : "text.primary",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function CountPill({ count }: { count: number }) {
  return (
    <Box
      component="span"
      sx={{
        minWidth: 22,
        height: 20,
        px: 0.75,
        borderRadius: 999,
        bgcolor: "primary.main",
        color: "common.white",
        fontSize: "0.7rem",
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {count > 999 ? "999+" : count}
    </Box>
  );
}

/** One transaction in a dashboard list: logo, name, optional date, and amount. */
function TransactionLine({ tx, first, showDate }: { tx: Transaction; first: boolean; showDate?: boolean }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 1.25,
        borderTop: first ? "none" : "1px solid",
        borderColor: "grey.100",
      }}
    >
      <MerchantAvatar name={tx.displayName} logoUrl={tx.logoUrl} size={28} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
          {tx.displayName}
        </Typography>
        {showDate && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {formatLongDate(tx.date)}
          </Typography>
        )}
      </Box>
      <TransactionAmount amount={tx.amount} />
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
        color: "primary.main",
        fontWeight: 600,
        textDecoration: "none",
        display: "inline-block",
        mt: compact ? 0 : 2,
        "&:hover": { textDecoration: "underline" },
      }}
    >
      {label}
    </Typography>
  );
}
