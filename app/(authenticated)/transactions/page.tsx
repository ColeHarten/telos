"use client";

import { syncStatusCaption } from "@/lib/connections";
import { runSync } from "@/lib/plaidSync";
import { isTransfer, needsReview } from "@/lib/budgetCalculations";
import { useAccounts } from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import { useCategories } from "@/lib/hooks/useCategories";
import useRules, { type RuleDraft } from "@/lib/hooks/useRules";
import useSyncRunning from "@/lib/hooks/useSyncRunning";
import useTransactions from "@/lib/hooks/useTransactions";
import {
  draftRuleFor,
  emptyActions,
  emptyConditions,
  findRuleFor,
  planAcceptSuggestions,
  planBulkCategory,
  planBulkHidden,
  planRuleApplication,
  type TransactionChanges,
} from "@/lib/categorization";
import { plaidCategoryLabel } from "@/lib/plaidCategories";
import type { Account, Rule, Transaction } from "@/lib/types/types";
import { categoryNote } from "./categoryNote";
import RulePromptDialog from "./RulePromptDialog";
import TransactionDrawer from "./TransactionDrawer";
import ApplyRuleDialog from "../rules/ApplyRuleDialog";
import RuleDialog from "../rules/RuleDialog";
import { describeActions, describeConditions } from "../rules/ruleText";
import CategoryPicker from "@/components/CategoryPicker";
import MerchantAvatar from "@/components/MerchantAvatar";
import PageHeader from "@/components/PageHeader";

// Icons
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FilterListIcon from "@mui/icons-material/FilterList";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import NorthEastIcon from "@mui/icons-material/NorthEast";
import SearchIcon from "@mui/icons-material/Search";
import SouthWestIcon from "@mui/icons-material/SouthWest";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SyncIcon from "@mui/icons-material/Sync";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const MAX_VISIBLE_PAGES = 5;

type StatusFilter = "all" | "pending" | "posted";
type DateRangePreset = "all" | "7d" | "30d" | "mtd" | "ytd" | "ltm" | "custom";
// "credit" = money coming in (i.e. tx.amount < 0 in this schema)
// "debit" = money going out (i.e. tx.amount > 0 in this schema)
// "review" = waiting in Needs Review
type FlowFilter = "all" | "credit" | "debit" | "review";

const FLOW_FILTER_TABS: { value: FlowFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "credit", label: "Money In" },
  { value: "debit", label: "Money Out" },
  { value: "review", label: "Needs Review" },
];

const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "mtd", label: "This Month" },
  { value: "ytd", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, "...", totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, "...", totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "...", currentPage, "...", totalPages];
}

function parseDateValue(dateValue: string) {
  const parsed = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(value: string) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return value;
  }
}

// Formats the live lastSyncedAt Date from useAccounts into the same
// "Mon D, YYYY" / "h:mm AM" split the "Last Synced" card renders. Returns
// null for both when there's no sync yet, so the card can fall back to
// "Never synced" instead of showing a stale placeholder date.
function formatLastSynced(lastSyncedAt: Date | null): { dateLabel: string; timeLabel: string | null } {
  if (!lastSyncedAt) {
    return { dateLabel: "Never synced", timeLabel: null };
  }

  return {
    dateLabel: lastSyncedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    timeLabel: lastSyncedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

// Local (not UTC) YYYY-MM-DD, matching the format used by <input type="date"> and stored transaction dates.
function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Resolves a preset into a concrete { from, to } range, anchored to today.
// "all" and "custom" are handled by the caller (custom uses user-entered dates).
function computePresetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  const today = toDateInputValue(now);

  switch (preset) {
    case "mtd": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateInputValue(from), to: today };
    }
    case "ytd": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: toDateInputValue(from), to: today };
    }
    case "ltm": {
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 1);
      from.setDate(from.getDate() + 1);
      return { from: toDateInputValue(from), to: today };
    }
    default:
      return { from: "", to: "" };
  }
}

function formatDateRangeButtonLabel(preset: DateRangePreset, customFrom: string, customTo: string) {
  if (preset === "custom") {
    if (!customFrom && !customTo) return "Custom Range";
    if (customFrom && customTo) return `${formatShortDate(customFrom)} - ${formatShortDate(customTo)}`;
    if (customFrom) return `From ${formatShortDate(customFrom)}`;
    return `Until ${formatShortDate(customTo)}`;
  }

  return DATE_RANGE_PRESETS.find((option) => option.value === preset)?.label ?? "All Time";
}

type SyncResponse = {
  message?: string;
  itemsNeedingReauth?: string[];
  itemsFailed?: string[];
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// A sync can succeed for some banks and not others; this says which need attention.
function describeSyncProblems(body: SyncResponse | null): string | null {
  const reauth = body?.itemsNeedingReauth?.length ?? 0;
  const failed = body?.itemsFailed?.length ?? 0;
  const parts: string[] = [];
  if (reauth) parts.push(`${plural(reauth, "bank needs", "banks need")} to be reconnected on the Accounts page`);
  if (failed) parts.push(`${plural(failed, "bank", "banks")} couldn't sync; try again in a few minutes`);
  return parts.length ? `${parts.join(". ")}.` : null;
}

export default function TransactionsPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [], lastSyncedAt, connections } = useAccounts(user, authLoading);
  const {
    transactions = [],
    transactionsLoading,
    transactionsError,
    setTransactionsError,
    hasOlderTransactions,
    loadOlderTransactions,
    updateTransactionAssignment,
    applyUpdates,
  } = useTransactions(user, authLoading, accounts);

  const { categories = [] } = useCategories(user, authLoading);
  const { rules, createRule } = useRules(user, authLoading);
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const accountsById = useMemo(() => new Map<string, Account>(accounts.map((account) => [account.id, account])), [accounts]);
  const syncRunning = useSyncRunning();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });

  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [filtersAnchorEl, setFiltersAnchorEl] = useState<null | HTMLElement>(null);
  const [accountMenuAnchorEl, setAccountMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [dateRangeAnchorEl, setDateRangeAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // Rule prompt, shown right after you categorize a transaction: offers a rule
  // for its merchant. The data outlives `open` so the dialog closes smoothly,
  // and a new key each time starts the dialog fresh.
  const [rulePrompt, setRulePrompt] = useState<{
    key: number;
    transactionId: string;
    merchant: string;
    merchantLabel: string;
    categoryId: string;
    categoryLabel: string;
  } | null>(null);
  const [rulePromptOpen, setRulePromptOpen] = useState(false);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Bulk selection. Only selected transactions that match the filters count.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // A new key resets the bulk category picker after each use.
  const [bulkPickerKey, setBulkPickerKey] = useState(0);

  // The detail drawer, by transaction id so it follows live updates.
  const [drawerTxId, setDrawerTxId] = useState<string | null>(null);
  const drawerTx = drawerTxId ? transactions.find((tx) => tx.id === drawerTxId) ?? null : null;

  // Create rule (from the drawer or a selection), then offer to apply it to past transactions.
  const [ruleDialog, setRuleDialog] = useState<{ key: number; open: boolean; initial: RuleDraft | null }>({
    key: 0,
    open: false,
    initial: null,
  });
  const [applying, setApplying] = useState<{ key: number; open: boolean; rule: Rule | null }>({ key: 0, open: false, rule: null });

  // Active accounts only. Archiving the selected account resets the filter to All Accounts.
  const selectableAccounts = useMemo(() => accounts.filter((account) => !account.isArchived), [accounts]);
  const selectedAccount = useMemo(
    () => selectableAccounts.find((account) => account.id === selectedAccountId) ?? null,
    [selectableAccounts, selectedAccountId]
  );
  const accountMenuOpen = Boolean(accountMenuAnchorEl);
  const dateRangeOpen = Boolean(dateRangeAnchorEl);

  // Resolve the active preset (or custom fields) into a concrete range once per render.
  const { from: effectiveDateFrom, to: effectiveDateTo } = useMemo(() => {
    if (dateRangePreset === "custom") return { from: customDateFrom, to: customDateTo };
    if (dateRangePreset === "all") return { from: "", to: "" };
    return computePresetRange(dateRangePreset);
  }, [dateRangePreset, customDateFrom, customDateTo]);

  const hasDateRange =
    dateRangePreset !== "all" && (dateRangePreset !== "custom" || Boolean(customDateFrom || customDateTo));
  const dateRangeLabel = useMemo(
    () => formatDateRangeButtonLabel(dateRangePreset, customDateFrom, customDateTo),
    [dateRangePreset, customDateFrom, customDateTo]
  );

  // Live "Last Synced": the bank synced longest ago, so a stuck bank isn't hidden by the others.
  const { dateLabel: lastSyncedDateLabel, timeLabel: lastSyncedTimeLabel } = useMemo(
    () => formatLastSynced(lastSyncedAt),
    [lastSyncedAt]
  );
  // Under Last Synced: banks that need attention, or an import still running.
  const syncCaption = syncStatusCaption(connections);

  // Top-tier filters: account + date range. These scope both the summary cards
  // and the list below, mirroring how account selection already works.
  const scopedTransactions = useMemo(() => {
    const fromTime = effectiveDateFrom ? parseDateValue(effectiveDateFrom) : null;
    const toTime = effectiveDateTo ? parseDateValue(effectiveDateTo) : null;

    return transactions.filter((transaction) => {
      if (selectedAccount && transaction.originAccId !== selectedAccount.id) return false;

      const transactionTime = parseDateValue(transaction.date);
      if (fromTime !== null && transactionTime !== null && transactionTime < fromTime) return false;
      if (toTime !== null && transactionTime !== null && transactionTime > toTime) return false;

      return true;
    });
  }, [transactions, selectedAccount, effectiveDateFrom, effectiveDateTo]);

  // List-only filters: search, status, amount. These narrow down the table
  // for finding specific transactions but should not move the summary cards.
  const filteredTransactions = useMemo(() => {
    const min = minAmount === "" ? null : Number(minAmount);
    const max = maxAmount === "" ? null : Number(maxAmount);
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return scopedTransactions.filter((transaction) => {
      const searchable = `${transaction.displayName} ${transaction.rawName ?? ""}`.toLowerCase();
      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (statusFilter === "pending" && !transaction.pending) return false;
      if (statusFilter === "posted" && transaction.pending) return false;
      if (flowFilter === "credit" && transaction.amount >= 0) return false;
      if (flowFilter === "debit" && transaction.amount < 0) return false;
      if (flowFilter === "review" && !needsReview(transaction)) return false;

      const amount = Math.abs(transaction.amount);
      if (min !== null && !Number.isNaN(min) && amount < min) return false;
      if (max !== null && !Number.isNaN(max) && amount > max) return false;

      return true;
    });
  }, [scopedTransactions, searchTerm, statusFilter, flowFilter, minAmount, maxAmount]);
  const reviewCount = useMemo(() => scopedTransactions.filter(needsReview).length, [scopedTransactions]);
  const selectedTransactions = useMemo(
    () => filteredTransactions.filter((transaction) => selectedIds.has(transaction.id)),
    [filteredTransactions, selectedIds]
  );
  const hasActiveFilters = Boolean(searchTerm || hasDateRange || statusFilter !== "all" || flowFilter !== "all" || minAmount || maxAmount || selectedAccount);

  // Summary metrics recompute from the top-tier scope only (account + date range),
  // so list-only filters like search/status/amount don't move the cards.
  // Transfers between your own accounts are left out, as on the Dashboard.
  const summary = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    let inflowCount = 0;
    let outflowCount = 0;

    for (const transaction of scopedTransactions) {
      if (transaction.hidden || isTransfer(transaction)) continue;
      if (transaction.amount > 0) {
        outflows += transaction.amount;
        outflowCount += 1;
      } else {
        inflows += Math.abs(transaction.amount);
        inflowCount += 1;
      }
    }

    return {
      inflows,
      outflows,
      inflowCount,
      outflowCount,
      net: inflows - outflows,
    };
  }, [scopedTransactions]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const paginatedTransactions = filteredTransactions.slice((currentPageSafe - 1) * pageSize, currentPageSafe * pageSize);
  const paginationItems = buildPaginationItems(currentPageSafe, totalPages);
  const filtersOpen = Boolean(filtersAnchorEl);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, effectiveDateFrom, effectiveDateTo, statusFilter, flowFilter, minAmount, maxAmount, selectedAccountId, pageSize]);

  async function handleSync() {
    setSyncing(true);
    setTransactionsError(null);

    try {
      const body = await runSync();

      // New transactions and Last Synced arrive through the live listeners.
      const problem = describeSyncProblems(body);
      if (problem) setTransactionsError(problem);
      else setSyncSuccess(true);
    } catch (err) {
      setTransactionsError(err instanceof Error ? err.message : "Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  /**
   * Applies your category pick ("" clears it, back to Needs Review), then
   * offers a rule for the merchant, unless the change failed or an enabled
   * rule already gives this merchant that category.
   */
  async function handleCategoryChange(tx: (typeof transactions)[number], categoryId: string) {
    if (!categoryId) {
      await updateTransactionAssignment(tx.id, undefined, undefined, null);
      return;
    }

    const category = categoriesById.get(categoryId);
    if (!category) return;
    // Only transfer categories carry a destination account.
    const transferAccountId = category.kind === "transfer" ? category.transferAccountId ?? null : null;

    const saved = await updateTransactionAssignment(tx.id, category.kind, categoryId, transferAccountId);
    if (!saved || findRuleFor(rules, tx, categoryId)) return;

    setRulePrompt((prev) => ({
      key: (prev?.key ?? 0) + 1,
      transactionId: tx.id,
      merchant: tx.merchantName || tx.rawName || tx.displayName,
      merchantLabel: tx.merchantName || tx.displayName,
      categoryId,
      categoryLabel: category.name,
    }));
    setRulePromptOpen(true);
  }

  // The rule the prompt offers, and what it would change among the other loaded transactions.
  const promptPlan = useMemo(() => {
    if (!rulePrompt) return null;
    const rule: Rule = {
      id: "draft",
      enabled: true,
      priority: 0,
      conditions: { ...emptyConditions(), merchant: { op: "is", value: rulePrompt.merchant } },
      actions: { ...emptyActions(), categoryId: rulePrompt.categoryId },
    };
    const others = transactions.filter((tx) => tx.id !== rulePrompt.transactionId);
    const plan = planRuleApplication(rule, others, categoriesById, false);
    return { rule, others, pastMatches: plan.updates.length, userPicks: plan.userPicks };
  }, [rulePrompt, transactions, categoriesById]);

  async function handleCreatePromptRule(applyToPast: boolean, includeUserPicks: boolean) {
    if (!promptPlan) return;
    const { rule, others } = promptPlan;
    const id = await createRule({ conditions: rule.conditions, actions: rule.actions });
    setRulePromptOpen(false);
    if (!id) {
      setTransactionsError("Could not save the rule.");
      return;
    }
    if (!applyToPast) return;
    const { updates } = planRuleApplication({ ...rule, id }, others, categoriesById, includeUserPicks);
    const saved = await applyUpdates(updates);
    if (saved > 0) setNotice(`Rule created and applied to ${saved} past ${saved === 1 ? "transaction" : "transactions"}.`);
  }

  // Plaid's less confident guesses, waiting in Needs Review.
  const suggestionUpdates = useMemo(() => planAcceptSuggestions(transactions, categoriesById), [transactions, categoriesById]);

  /** Accepts one suggestion as your own pick, which also feeds merchant memory. */
  async function acceptSuggestion(tx: (typeof transactions)[number]) {
    const category = tx.suggestedCategoryId ? categoriesById.get(tx.suggestedCategoryId) : undefined;
    if (!category) return;
    const transferAccountId = category.kind === "transfer" ? category.transferAccountId ?? null : null;
    await updateTransactionAssignment(tx.id, category.kind, category.id, transferAccountId);
  }

  async function handleAcceptAllSuggestions() {
    setAcceptingAll(true);
    const saved = await applyUpdates(suggestionUpdates);
    setAcceptingAll(false);
    if (saved > 0) setNotice(`Accepted ${saved} ${saved === 1 ? "suggestion" : "suggestions"}.`);
  }

  const isLoading = authLoading || transactionsLoading;

  // ---- Selection
  const pageIds = paginatedTransactions.map((tx) => tx.id);
  const pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length;
  const allSelectedHidden = selectedTransactions.length > 0 && selectedTransactions.every((tx) => tx.hidden);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const selectAll = pageIds.some((id) => !next.has(id));
      for (const id of pageIds) {
        if (selectAll) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  /** Your category on every selected transaction (a transfer is skipped on its own account). */
  async function handleBulkCategory(categoryId: string) {
    const category = categoriesById.get(categoryId);
    setBulkPickerKey((key) => key + 1);
    if (!category) return;
    const { updates, skipped } = planBulkCategory(selectedTransactions, categoryId, categoriesById);
    setBulkBusy(true);
    const saved = await applyUpdates(updates);
    setBulkBusy(false);
    if (saved === updates.length) clearSelection();
    const parts: string[] = [];
    if (saved > 0) parts.push(`Moved ${plural(saved, "transaction", "transactions")} to ${category.name}.`);
    if (skipped > 0) parts.push(`Skipped ${plural(skipped, "transfer", "transfers")} to its own account.`);
    if (parts.length > 0) setNotice(parts.join(" "));
  }

  async function handleBulkHidden(hidden: boolean) {
    const updates = planBulkHidden(selectedTransactions, hidden);
    setBulkBusy(true);
    const saved = await applyUpdates(updates);
    setBulkBusy(false);
    if (saved === updates.length) clearSelection();
    if (saved > 0) setNotice(`${hidden ? "Hid" : "Unhid"} ${plural(saved, "transaction", "transactions")}.`);
  }

  // ---- Drawer and rules
  async function saveTransactionChanges(tx: Transaction, changes: TransactionChanges): Promise<boolean> {
    return (await applyUpdates([{ id: tx.id, changes }])) === 1;
  }

  function openRuleDialog(initial: RuleDraft) {
    setDrawerTxId(null);
    setRuleDialog((prev) => ({ key: prev.key + 1, open: true, initial }));
  }

  async function handleRuleSave(draft: RuleDraft): Promise<boolean> {
    const id = await createRule(draft);
    if (!id) return false;
    const created: Rule = { id, enabled: true, priority: 0, ...draft };
    // Offer to apply the new rule to the transactions it already matches.
    if (planRuleApplication(created, transactions, categoriesById, false).updates.length > 0) {
      setApplying((prev) => ({ key: prev.key + 1, open: true, rule: created }));
    } else {
      setNotice("Rule created.");
    }
    return true;
  }

  async function handleApplyRule(rule: Rule, includeUserPicks: boolean) {
    const { updates } = planRuleApplication(rule, transactions, categoriesById, includeUserPicks);
    const saved = await applyUpdates(updates);
    if (saved > 0) setNotice(`Rule applied to ${plural(saved, "transaction", "transactions")}.`);
  }

  // A transfer category can't send money to the account it came from.
  const excludeOwnTransfer = (tx: Transaction) => (category: { kind: string; transferAccountId?: string | null }) =>
    category.kind === "transfer" && category.transferAccountId === tx.originAccId;

  function formatAmount(tx: Transaction) {
    return tx.amount > 0 ? `(${tx.amount.toFixed(2)})` : Math.abs(tx.amount).toFixed(2);
  }

  const formatDateString = (dateInput: string) => {
    try {
      return new Date(dateInput + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateInput;
    }
  };

  const startItem = filteredTransactions.length === 0 ? 0 : (currentPageSafe - 1) * pageSize + 1;
  const endItem = Math.min(currentPageSafe * pageSize, filteredTransactions.length);

  return (
    <Stack spacing={3} sx={{ p: 4, bgcolor: "#f8fafc", minHeight: "100vh" }}>

      {/* 1. Header Toolbar Actions */}
      <PageHeader title="Transactions">
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1.5 }}>
          <Button
            variant="outlined"
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
            startIcon={<AccountBalanceOutlinedIcon sx={{ color: "#0284c7", fontSize: 18 }} />}
            onClick={(event) => setAccountMenuAnchorEl(event.currentTarget)}
            sx={{
              borderColor: selectedAccount ? "#bfdbfe" : "#e2e8f0",
              color: selectedAccount ? "#2563eb" : "#334155",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              bgcolor: selectedAccount ? "#eff6ff" : "#fff",
              px: 1.75,
              py: 0.85,
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.04)",
              maxWidth: 220,
              "&:hover": { borderColor: "#cbd5e1", bgcolor: selectedAccount ? "#eff6ff" : "#f8fafc" },
            }}
          >
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedAccount ? selectedAccount.name : "All Accounts"}
            </Box>
          </Button>

          <Button
            variant="outlined"
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
            startIcon={<CalendarMonthOutlinedIcon sx={{ color: "#0284c7", fontSize: 18 }} />}
            onClick={(event) => setDateRangeAnchorEl(event.currentTarget)}
            sx={{
              borderColor: hasDateRange ? "#bfdbfe" : "#e2e8f0",
              color: hasDateRange ? "#2563eb" : "#334155",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              bgcolor: hasDateRange ? "#eff6ff" : "#fff",
              px: 1.75,
              py: 0.85,
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.04)",
              whiteSpace: "nowrap",
              "&:hover": { borderColor: "#cbd5e1", bgcolor: hasDateRange ? "#eff6ff" : "#f8fafc" },
            }}
          >
            {dateRangeLabel}
          </Button>

          <Button
            variant="outlined"
            startIcon={syncing || syncRunning ? <CircularProgress size={14} color="inherit" /> : <SyncIcon sx={{ color: "#2563eb", fontSize: 18 }} />}
            onClick={handleSync}
            disabled={syncing || syncRunning || isLoading}
            sx={{
              borderColor: "#bfdbfe",
              color: "#2563eb",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              bgcolor: "#fff",
              px: 1.75,
              py: 0.85,
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.04)",
              "&:hover": { borderColor: "#93c5fd", bgcolor: "#eff6ff" },
            }}
          >
            {syncing || syncRunning ? "Syncing..." : "Sync Transactions"}
          </Button>
        </Stack>
      </PageHeader>

      {/* Account filter menu */}
      <Menu
        anchorEl={accountMenuAnchorEl}
        open={accountMenuOpen}
        onClose={() => setAccountMenuAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              borderRadius: 3,
              minWidth: 260,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            },
          },
        }}
      >
        <MenuItem
          selected={selectedAccount === null}
          onClick={() => {
            setSelectedAccountId(null);
            setAccountMenuAnchorEl(null);
          }}
          sx={{ fontWeight: 600, fontSize: "0.85rem" }}
        >
          <ListItemText>All Accounts</ListItemText>
          {selectedAccount === null && (
            <ListItemIcon sx={{ minWidth: "auto", ml: 1 }}>
              <CheckRoundedIcon sx={{ fontSize: 18, color: "#2563eb" }} />
            </ListItemIcon>
          )}
        </MenuItem>

        {selectableAccounts.map((account) => (
          <MenuItem
            key={account.id}
            selected={selectedAccountId === account.id}
            onClick={() => {
              setSelectedAccountId(account.id);
              setAccountMenuAnchorEl(null);
            }}
            sx={{ fontSize: "0.85rem" }}
          >
            <ListItemText
              primary={account.name}
              slotProps={{ primary: { sx: { fontWeight: 500 } } }}
            />
            {selectedAccountId === account.id && (
              <ListItemIcon sx={{ minWidth: "auto", ml: 1 }}>
                <CheckRoundedIcon sx={{ fontSize: 18, color: "#2563eb" }} />
              </ListItemIcon>
            )}
          </MenuItem>
        ))}

        {selectableAccounts.length === 0 && (
          <MenuItem disabled sx={{ fontSize: "0.85rem" }}>
            No accounts found
          </MenuItem>
        )}
      </Menu>

      {/* Date range filter menu: quick presets + inline custom range */}
      <Menu
        anchorEl={dateRangeAnchorEl}
        open={dateRangeOpen}
        onClose={() => setDateRangeAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              borderRadius: 3,
              minWidth: 240,
              border: "1px solid #e2e8f0",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
            },
          },
        }}
      >
        {DATE_RANGE_PRESETS.map((option) => (
          <MenuItem
            key={option.value}
            selected={dateRangePreset === option.value}
            onClick={() => {
              setDateRangePreset(option.value);
              // Every preset resolves to a concrete range immediately, so it's
              // safe to close right away. Custom stays open to collect dates.
              if (option.value !== "custom") {
                setDateRangeAnchorEl(null);
              }
            }}
            sx={{ fontSize: "0.85rem", fontWeight: dateRangePreset === option.value ? 600 : 500 }}
          >
            <ListItemText>{option.label}</ListItemText>
            {dateRangePreset === option.value && (
              <ListItemIcon sx={{ minWidth: "auto", ml: 1 }}>
                <CheckRoundedIcon sx={{ fontSize: 18, color: "#2563eb" }} />
              </ListItemIcon>
            )}
          </MenuItem>
        ))}

        {dateRangePreset === "custom" && (
          <Box key="custom-range-fields" sx={{ px: 2, pt: 0.5, pb: 2 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack direction="column" spacing={1.5}>
              <TextField
                label="From"
                type="date"
                size="small"
                value={customDateFrom}
                onChange={(event) => setCustomDateFrom(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: "100%" }}
              />
              <TextField
                label="To"
                type="date"
                size="small"
                value={customDateTo}
                onChange={(event) => setCustomDateTo(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: "100%" }}
              />
              <Button
                variant="contained"
                disableElevation
                size="small"
                onClick={() => setDateRangeAnchorEl(null)}
                disabled={!customDateFrom && !customDateTo}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  bgcolor: "#2563eb",
                  borderRadius: 1.5,
                  "&:hover": { bgcolor: "#1d4ed8" },
                }}
              >
                Apply
              </Button>
            </Stack>
          </Box>
        )}
      </Menu>

      {/* 2. Top Metric Cards Dashboard Segment */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
          gap: 2,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Total Inflows</Typography>
              <Typography sx={{ fontWeight: 700, color: "#16a34a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
                {formatMoney(summary.inflows)}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                {summary.inflowCount} transactions
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "#f0fdf4", color: "#16a34a", width: 44, height: 44 }}>
              <SouthWestIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Total Outflows</Typography>
              <Typography sx={{ fontWeight: 700, color: "#dc2626", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
                {formatMoney(summary.outflows)}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                {summary.outflowCount} transactions
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "#fef2f2", color: "#dc2626", width: 44, height: 44 }}>
              <NorthEastIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Net Cash Flow</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
                {formatMoney(summary.net)}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                {selectedAccount ? selectedAccount.name : "All accounts"}{hasDateRange ? ` · ${dateRangeLabel}` : ""}
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "#f5f3ff", color: "#7c3aed", width: 44, height: 44 }}>
              <SwapHorizIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Last Synced</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", mt: 0.5, fontSize: "1.25rem" }}>{syncing ? "Syncing…" : lastSyncedDateLabel}</Typography>
              {!syncing && lastSyncedTimeLabel && (
                <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                  {lastSyncedTimeLabel}
                </Typography>
              )}
              {!syncing && syncCaption && (
                <Typography
                  variant="caption"
                  sx={{ color: syncCaption.attention ? "#dc2626" : "#2563eb", display: "block", mt: 0.25, fontSize: "0.75rem", fontWeight: 600 }}
                >
                  {syncCaption.text}
                </Typography>
              )}
            </Box>
            <Avatar sx={{ bgcolor: "#eff6ff", color: "#2563eb", width: 44, height: 44 }}>
              <CalendarMonthOutlinedIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>
      </Box>

      {/* 3. Sub-Navigation and Inline Filtering Controls */}
      <Stack
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          width: "100%",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Tabs
          value={flowFilter}
          onChange={(_event, value) => setFlowFilter(value as FlowFilter)}
          variant="scrollable"
          scrollButtons={false}
          sx={{
            minHeight: 40,
            bgcolor: "#fff",
            borderRadius: 2,
            border: "1px solid #e2e8f0",
            p: 0.5,
            width: "fit-content",
            maxWidth: "100%",
            "& .MuiTabs-indicator": { display: "none" },
          }}
        >
          {FLOW_FILTER_TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={tab.value === "review" && reviewCount > 0 ? `${tab.label} (${reviewCount})` : tab.label}
              disableRipple
              sx={{
                minHeight: 32,
                minWidth: 0,
                px: 1.75,
                borderRadius: 1.5,
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.8rem",
                color: "#64748b",
                "&.Mui-selected": {
                  color: "#2563eb",
                  bgcolor: "#eff6ff",
                },
              }}
            />
          ))}
        </Tabs>

        <Stack
          sx={{
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            gap: 1.5,
          }}
        >
        <TextField
          size="small"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          slotProps={{ input: { 
            sx: { fontSize: "0.85rem" },
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: "#94a3b8", fontSize: 18 }} />
              </InputAdornment>
            ),
          } }}
          sx={{
            bgcolor: "#fff",
            minWidth: 260,
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
              fontSize: "0.875rem",
              "& fieldset": { borderColor: "#e2e8f0" },
              "&:hover fieldset": { borderColor: "#cbd5e1" },
            },
          }}
        />
        <Button
          variant="outlined"
          startIcon={<FilterListIcon sx={{ fontSize: 17 }} />}
          onClick={(event) => setFiltersAnchorEl(event.currentTarget)}
          sx={{
            borderColor: "#e2e8f0",
            color: filtersOpen ? "#2563eb" : "#334155",
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.85rem",
            borderRadius: 2,
            bgcolor: "#fff",
            px: 1.75,
            "&:hover": { borderColor: "#cbd5e1", bgcolor: "#f8fafc" },
          }}
        >
          Filters
        </Button>
        </Stack>
      </Stack>

      <Menu
        anchorEl={filtersAnchorEl}
        open={filtersOpen}
        onClose={() => setFiltersAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1, p: 0, borderRadius: 3, border: "1px solid #e2e8f0", boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)", overflow: "visible" } } }}
      >
        <Box sx={{ p: 2.5, minWidth: 320, bgcolor: "#fff" }}>
          <Stack direction="column" spacing={2} sx={{ width: "100%" }}>
            <Select
              value={statusFilter}
              size="small"
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              sx={{ width: "100%", height: 40, bgcolor: "#fff" }}
            >
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="posted">Posted</MenuItem>
            </Select>
            <TextField
              label="Min amount"
              type="number"
              size="small"
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
              slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
              sx={{ width: "100%" }}
            />
            <TextField
              label="Max amount"
              type="number"
              size="small"
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
              slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
              sx={{ width: "100%" }}
            />
            <Button
              variant="text"
              onClick={() => {
                setStatusFilter("all");
                setFlowFilter("all");
                setMinAmount("");
                setMaxAmount("");
              }}
              sx={{ textTransform: "none", fontWeight: 600, alignSelf: "flex-start", px: 0 }}
            >
              Clear filters
            </Button>
          </Stack>
        </Box>
      </Menu>

      {transactionsError && (
        <Alert severity="error" onClose={() => setTransactionsError(null)} sx={{ borderRadius: 3 }}>
          {transactionsError}
        </Alert>
      )}

      {suggestionUpdates.length > 0 && (
        <Alert
          severity="info"
          sx={{ borderRadius: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={handleAcceptAllSuggestions}
              disabled={acceptingAll}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              {acceptingAll ? "Accepting…" : "Accept all"}
            </Button>
          }
        >
          Plaid suggests a category for {suggestionUpdates.length} uncategorized{" "}
          {suggestionUpdates.length === 1 ? "transaction" : "transactions"}. Accept them below one at a time, or all at once.
        </Alert>
      )}

      {/* 4. Transactions: a table, or cards on small screens */}
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 12 }}>
          <CircularProgress size={40} thickness={4} sx={{ color: "#2563eb" }} />
        </Box>
      ) : filteredTransactions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 8, textAlign: "center", borderRadius: 3, borderStyle: "dashed", bgcolor: "#fff" }}>
          <Typography color="text.secondary" variant="body2">
            {transactions.length === 0 && !hasActiveFilters
              ? "No transactions yet. Connect a bank on the Accounts page, or add a manual account."
              : flowFilter === "review"
                ? "Nothing needs review."
                : "No transactions match the current filters."}
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          {/* Bulk actions for the selected transactions */}
          {selectedTransactions.length > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1.5,
                px: 2.5,
                py: 1.5,
                bgcolor: "#eff6ff",
                borderBottom: "1px solid #bfdbfe",
              }}
            >
              <Typography sx={{ fontWeight: 700, color: "#1e3a8a", fontSize: "0.85rem" }}>
                {selectedTransactions.length} selected
              </Typography>
              {selectedTransactions.length < filteredTransactions.length && (
                <Button
                  size="small"
                  onClick={() => setSelectedIds(new Set(filteredTransactions.map((tx) => tx.id)))}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  Select all {filteredTransactions.length}
                </Button>
              )}
              <Box sx={{ width: 240, bgcolor: "#fff", borderRadius: 1 }}>
                <CategoryPicker
                  key={bulkPickerKey}
                  categories={categories}
                  value={null}
                  onChange={(categoryId) => {
                    if (categoryId) void handleBulkCategory(categoryId);
                  }}
                  placeholder="Set category"
                  disabled={bulkBusy}
                />
              </Box>
              <Button
                size="small"
                startIcon={<VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} />}
                onClick={() => void handleBulkHidden(!allSelectedHidden)}
                disabled={bulkBusy}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                {allSelectedHidden ? "Unhide" : "Hide"}
              </Button>
              <Button
                size="small"
                startIcon={<BoltIcon sx={{ fontSize: 18 }} />}
                onClick={() => openRuleDialog(draftRuleFor(selectedTransactions))}
                disabled={bulkBusy}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Create rule
              </Button>
              <Box sx={{ flex: 1 }} />
              {bulkBusy && <CircularProgress size={18} />}
              <IconButton aria-label="Clear selection" size="small" onClick={clearSelection}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          )}

          {isMobile ? (
            <Box>
              {paginatedTransactions.map((tx) => {
                const category = tx.categoryId ? categoriesById.get(tx.categoryId) : undefined;
                const waiting = needsReview(tx);
                const note = categoryNote(tx);
                const selected = selectedIds.has(tx.id);

                return (
                  <Box
                    key={tx.id}
                    onClick={() => setDrawerTxId(tx.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      px: 1.5,
                      py: 1.25,
                      borderBottom: "1px solid #f1f5f9",
                      cursor: "pointer",
                      opacity: tx.hidden ? 0.55 : 1,
                      bgcolor: selected ? "#f8fbff" : "#fff",
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleSelected(tx.id)}
                      slotProps={{ input: { "aria-label": `Select ${tx.displayName}` } }}
                      sx={{ p: 0.5 }}
                    />
                    <MerchantAvatar name={tx.displayName} logoUrl={tx.logoUrl} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography noWrap sx={{ fontWeight: 600, color: "#0f172a", fontSize: "0.875rem" }}>
                        {tx.displayName}
                      </Typography>
                      <Typography noWrap variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.75rem" }}>
                        {formatDateString(tx.date)} · {tx.originAccName}
                        {tx.pending ? " · Pending" : ""}
                      </Typography>
                      {category ? (
                        <Typography noWrap variant="caption" sx={{ color: "#2563eb", display: "block", fontWeight: 600, fontSize: "0.75rem" }}>
                          {category.name}
                        </Typography>
                      ) : waiting ? (
                        <Typography noWrap variant="caption" sx={{ color: "#dc2626", display: "block", fontWeight: 600, fontSize: "0.75rem" }}>
                          Needs Review
                        </Typography>
                      ) : (
                        note && (
                          <Typography noWrap variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.75rem" }}>
                            {note}
                          </Typography>
                        )
                      )}
                    </Box>
                    <Typography
                      sx={{ fontWeight: 700, fontSize: "0.875rem", color: tx.amount > 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap" }}
                    >
                      {formatAmount(tx)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ borderBottom: "1px solid #e2e8f0" }}>
                  <TableCell padding="checkbox" sx={{ pl: 1.5 }}>
                    <Checkbox
                      size="small"
                      checked={pageIds.length > 0 && pageSelectedCount === pageIds.length}
                      indeterminate={pageSelectedCount > 0 && pageSelectedCount < pageIds.length}
                      onChange={togglePage}
                      slotProps={{ input: { "aria-label": "Select this page" } }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Account</TableCell>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem", pr: 3 }}>Amount</TableCell>
                  <TableCell align="center" sx={{ py: 1.75, width: 50 }} />
                </TableRow>
              </TableHead>

              <TableBody>
                {paginatedTransactions.map((tx) => {
                  const isExpense = tx.amount > 0;
                  const suggestion = !tx.categoryId && tx.suggestedCategoryId ? categoriesById.get(tx.suggestedCategoryId) : undefined;
                  const note = categoryNote(tx);
                  const selected = selectedIds.has(tx.id);

                  return (
                    <TableRow
                      key={tx.id}
                      selected={selected}
                      sx={{
                        opacity: tx.hidden ? 0.55 : 1,
                        "&:hover": { backgroundColor: "#f8fafc" },
                        "&.Mui-selected, &.Mui-selected:hover": { backgroundColor: "#f8fbff" },
                        "& td": { py: 1.75, borderBottom: "1px solid #f1f5f9" },
                      }}
                    >
                      <TableCell padding="checkbox" sx={{ pl: 1.5 }}>
                        <Checkbox
                          size="small"
                          checked={selected}
                          onChange={() => toggleSelected(tx.id)}
                          slotProps={{ input: { "aria-label": `Select ${tx.displayName}` } }}
                        />
                      </TableCell>

                      {/* Date */}
                      <TableCell sx={{ color: "#334155", fontWeight: 500, whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                        {formatDateString(tx.date)}
                      </TableCell>

                      {/* Description / Merchant: opens the detail drawer */}
                      <TableCell onClick={() => setDrawerTxId(tx.id)} sx={{ cursor: "pointer" }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                          <MerchantAvatar name={tx.displayName} logoUrl={tx.logoUrl} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 600, color: "#0f172a", fontSize: "0.875rem", lineHeight: 1.3 }}>
                              {tx.displayName}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.75rem" }}>
                              {tx.notes ? tx.notes : plaidCategoryLabel(tx.plaidCategoryDetailed ?? tx.plaidCategoryPrimary) || "No Plaid category"}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* Account */}
                      <TableCell>
                        <Typography sx={{ fontWeight: 500, color: "#334155", fontSize: "0.85rem" }}>
                          {tx.originAccName || "Plaid Account"}
                        </Typography>
                      </TableCell>

                      {/* Category */}
                      <TableCell sx={{ minWidth: 210 }}>
                        <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                          <Box
                            sx={{
                              width: 210,
                              "& .MuiAutocomplete-inputRoot": { py: "1px", fontSize: "0.8rem", bgcolor: "#fff" },
                              "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
                            }}
                          >
                            <CategoryPicker
                              categories={categories}
                              value={tx.categoryId ?? null}
                              onChange={(categoryId) => void handleCategoryChange(tx, categoryId ?? "")}
                              placeholder="Needs Review"
                              exclude={excludeOwnTransfer(tx)}
                            />
                          </Box>
                          {suggestion ? (
                            <Chip
                              size="small"
                              icon={<CheckRoundedIcon sx={{ fontSize: 14 }} />}
                              label={`Suggested: ${suggestion.name}`}
                              onClick={() => acceptSuggestion(tx)}
                              sx={{ height: 22, fontSize: "0.72rem", fontWeight: 600, bgcolor: "#eff6ff", color: "#2563eb", borderRadius: 1.5 }}
                            />
                          ) : (
                            note && (
                              <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                                {note}
                              </Typography>
                            )
                          )}
                        </Stack>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Chip
                          size="small"
                          label={tx.pending ? "Pending" : "Posted"}
                          sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            bgcolor: tx.pending ? "#fffbeb" : "#f0fdf4",
                            color: tx.pending ? "#d97706" : "#16a34a",
                            borderRadius: 1.5,
                          }}
                        />
                      </TableCell>

                      {/* Amount */}
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.875rem", color: isExpense ? "#dc2626" : "#16a34a", pr: 3 }}>
                        {formatAmount(tx)}
                      </TableCell>

                      {/* Details */}
                      <TableCell align="center">
                        <IconButton size="small" aria-label="Details" onClick={() => setDrawerTxId(tx.id)} sx={{ color: "#94a3b8" }}>
                          <MoreHorizIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          )}

          {/* 5. Pagination View */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ px: 3, py: 2, borderTop: "1px solid #f1f5f9", bgcolor: "#fff", alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="body2" sx={{ color: "#64748b", fontSize: "0.85rem" }}>
              Showing {startItem} to {endItem} of {filteredTransactions.length} transactions
            </Typography>

            <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <IconButton
                  size="small"
                  disabled={currentPageSafe === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  sx={{ border: "1px solid #e2e8f0", borderRadius: 1.5, p: 0.5 }}
                >
                  <KeyboardArrowLeftIcon fontSize="small" />
                </IconButton>

                {paginationItems.map((pageItem, index) =>
                  pageItem === "..." ? (
                    <Typography
                      key={`ellipsis-${index}`}
                      sx={{ minWidth: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontWeight: 600, fontSize: "0.85rem", userSelect: "none" }}
                    >
                      ...
                    </Typography>
                  ) : (
                    (() => {
                      const pageNumber = pageItem as number;

                      return (
                    <Button
                      key={pageNumber}
                      size="small"
                      variant={pageNumber === currentPageSafe ? "outlined" : "text"}
                      onClick={() => setCurrentPage(pageNumber)}
                      sx={{ minWidth: 30, height: 30, p: 0, borderRadius: 1.5, bgcolor: pageNumber === currentPageSafe ? "#eff6ff" : "transparent", color: pageNumber === currentPageSafe ? "#2563eb" : "#64748b", borderColor: pageNumber === currentPageSafe ? "#bfdbfe" : "transparent", fontWeight: 600, fontSize: "0.85rem" }}
                    >
                      {pageNumber}
                    </Button>
                      );
                    })()
                  )
                )}

                <IconButton
                  size="small"
                  disabled={currentPageSafe === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  sx={{ border: "1px solid #e2e8f0", borderRadius: 1.5, p: 0.5 }}
                >
                  <KeyboardArrowRightIcon fontSize="small" />
                </IconButton>
              </Stack>

              <Select
                value={pageSize}
                size="small"
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
                sx={{
                  height: 34,
                  fontSize: "0.82rem",
                  color: "#334155",
                  fontWeight: 500,
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
                  borderRadius: 2,
                  bgcolor: "#fff",
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option} per page
                  </MenuItem>
                ))}
              </Select>
            </Stack>
          </Stack>
        </Paper>
      )}

      {hasOlderTransactions && (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Button variant="text" onClick={loadOlderTransactions} sx={{ textTransform: "none", fontWeight: 600 }}>
            Load older transactions
          </Button>
        </Box>
      )}

      <TransactionDrawer
        transaction={drawerTx}
        categories={categories}
        rules={rules}
        accountsById={accountsById}
        categoriesById={categoriesById}
        onClose={() => setDrawerTxId(null)}
        onCategoryChange={(tx, categoryId) => void handleCategoryChange(tx, categoryId)}
        onAcceptSuggestion={(tx) => void acceptSuggestion(tx)}
        onSave={saveTransactionChanges}
        onCreateRule={(tx) => openRuleDialog(draftRuleFor([tx]))}
      />

      <RuleDialog
        key={`rule-${ruleDialog.key}`}
        open={ruleDialog.open}
        rule={null}
        initial={ruleDialog.initial}
        categories={categories}
        accounts={accounts}
        transactions={transactions}
        onClose={() => setRuleDialog((prev) => ({ ...prev, open: false }))}
        onSave={handleRuleSave}
      />

      <ApplyRuleDialog
        key={`apply-${applying.key}`}
        open={applying.open}
        rule={applying.rule}
        summary={applying.rule ? `${describeConditions(applying.rule, accountsById)} → ${describeActions(applying.rule, categoriesById)}` : ""}
        transactions={transactions}
        categoriesById={categoriesById}
        onClose={() => setApplying((prev) => ({ ...prev, open: false }))}
        onApply={handleApplyRule}
      />

      <RulePromptDialog
        key={rulePrompt?.key ?? 0}
        open={rulePromptOpen}
        merchantLabel={rulePrompt?.merchantLabel ?? ""}
        categoryLabel={rulePrompt?.categoryLabel ?? ""}
        pastMatches={promptPlan?.pastMatches ?? 0}
        userPicks={promptPlan?.userPicks ?? 0}
        onDismiss={() => setRulePromptOpen(false)}
        onConfirm={handleCreatePromptRule}
      />

      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)} sx={{ borderRadius: 2.5 }}>
          {notice}
        </Alert>
      </Snackbar>

      <Snackbar
        open={syncSuccess}
        autoHideDuration={4000}
        onClose={() => setSyncSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSyncSuccess(false)} sx={{ borderRadius: 2.5 }}>
          Transactions synced successfully.
        </Alert>
      </Snackbar>
    </Stack>
  );
}