"use client";

import { isTransfer, needsReview } from "@/lib/budgetCalculations";
import { dateHeading, groupByDate } from "@/lib/dateGroups";
import { useAccounts } from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import { useCategories } from "@/lib/hooks/useCategories";
import useRules, { type RuleDraft } from "@/lib/hooks/useRules";
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
 transferFits } from "@/lib/categorization";
import { plaidCategoryLabel } from "@/lib/plaidCategories";
import type { Account, Rule, Transaction } from "@/lib/types/types";
import { formatCurrency, formatSignedCurrency } from "@/lib/utils";
import { categoryNote } from "./categoryNote";
import RulePromptDialog from "./RulePromptDialog";
import TransactionDrawer from "./TransactionDrawer";
import ApplyRuleDialog from "../rules/ApplyRuleDialog";
import RuleDialog from "../rules/RuleDialog";
import { describeActions, describeConditions } from "../rules/ruleText";
import CategoryPicker from "@/components/CategoryPicker";
import EmptyState from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import MerchantAvatar from "@/components/MerchantAvatar";
import PageHeader from "@/components/PageHeader";
import StatStrip from "@/components/StatStrip";
import TransactionAmount from "@/components/TransactionAmount";

// Icons
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FilterListIcon from "@mui/icons-material/FilterList";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
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
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

// Transactions shown at first, and added by each Show more.
const PAGE_STEP = 50;

type StatusFilter = "all" | "pending" | "posted";
type DateRangePreset = "all" | "7d" | "30d" | "mtd" | "ytd" | "ltm" | "custom";
// "credit" = money coming in (i.e. tx.amount < 0 in this schema)
// "debit" = money going out (i.e. tx.amount > 0 in this schema)
// "review" = waiting in Needs review
type FlowFilter = "all" | "credit" | "debit" | "review";

const FLOW_FILTER_TABS: { value: FlowFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "credit", label: "Money in" },
  { value: "debit", label: "Money out" },
  { value: "review", label: "Needs review" },
];

const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "mtd", label: "This month" },
  { value: "ytd", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function parseDateValue(dateValue: string) {
  const parsed = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function formatShortDate(value: string) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return value;
  }
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
    if (!customFrom && !customTo) return "Custom range";
    if (customFrom && customTo) return `${formatShortDate(customFrom)} – ${formatShortDate(customTo)}`;
    if (customFrom) return `From ${formatShortDate(customFrom)}`;
    return `Until ${formatShortDate(customTo)}`;
  }

  return DATE_RANGE_PRESETS.find((option) => option.value === preset)?.label ?? "All time";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default function TransactionsPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [] } = useAccounts(user, authLoading);
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });

  const [filtersAnchorEl, setFiltersAnchorEl] = useState<null | HTMLElement>(null);
  const [accountMenuAnchorEl, setAccountMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [dateRangeAnchorEl, setDateRangeAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
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

  // Active accounts only. Archiving the selected account resets the filter to All accounts.
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

  // Show more: the first PAGE_STEP, then PAGE_STEP more each time. Changing a
  // filter starts over, because the count is kept per filter combination.
  const filterKey = [searchTerm, effectiveDateFrom, effectiveDateTo, statusFilter, flowFilter, minAmount, maxAmount, selectedAccountId].join("|");
  const [shown, setShown] = useState<{ key: string; count: number }>({ key: "", count: PAGE_STEP });
  const visibleCount = shown.key === filterKey ? shown.count : PAGE_STEP;
  const visibleTransactions = useMemo(() => filteredTransactions.slice(0, visibleCount), [filteredTransactions, visibleCount]);
  const groups = useMemo(() => groupByDate(visibleTransactions), [visibleTransactions]);
  const filtersOpen = Boolean(filtersAnchorEl);

  function showMore() {
    setShown({ key: filterKey, count: visibleCount + PAGE_STEP });
  }

  /**
   * Applies your category pick ("" clears it, back to Needs review), then
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

  // Plaid's less confident guesses, waiting in Needs review.
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
  const shownIds = visibleTransactions.map((tx) => tx.id);
  const shownSelectedCount = shownIds.filter((id) => selectedIds.has(id)).length;
  const allSelectedHidden = selectedTransactions.length > 0 && selectedTransactions.every((tx) => tx.hidden);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShown() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const selectAll = shownIds.some((id) => !next.has(id));
      for (const id of shownIds) {
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

  // A transfer to the transaction's own account only fits money coming in.
  const excludeOwnTransfer = (tx: Transaction) => (category: { kind: string; transferAccountId?: string | null }) =>
    category.kind === "transfer" && !transferFits(category.transferAccountId, tx.originAccId, tx.amount);

  // ---- Active filters, shown as chips you can clear one at a time.
  const amountFilterLabel =
    minAmount && maxAmount
      ? `${formatCurrency(Number(minAmount))} to ${formatCurrency(Number(maxAmount))}`
      : minAmount
        ? `At least ${formatCurrency(Number(minAmount))}`
        : `Up to ${formatCurrency(Number(maxAmount))}`;
  const activeFilters: { key: string; label: string; onClear: () => void }[] = [];
  if (selectedAccount) {
    activeFilters.push({ key: "account", label: selectedAccount.name, onClear: () => setSelectedAccountId(null) });
  }
  if (hasDateRange) {
    activeFilters.push({ key: "date", label: dateRangeLabel, onClear: clearDateRange });
  }
  if (statusFilter !== "all") {
    activeFilters.push({ key: "status", label: statusFilter === "pending" ? "Pending only" : "Posted only", onClear: () => setStatusFilter("all") });
  }
  if (minAmount || maxAmount) {
    activeFilters.push({
      key: "amount",
      label: amountFilterLabel,
      onClear: () => {
        setMinAmount("");
        setMaxAmount("");
      },
    });
  }

  function clearDateRange() {
    setDateRangePreset("all");
    setCustomDateFrom("");
    setCustomDateTo("");
  }

  function clearAllFilters() {
    setSelectedAccountId(null);
    clearDateRange();
    setStatusFilter("all");
    setMinAmount("");
    setMaxAmount("");
    setSearchTerm("");
  }

  return (
    <Stack spacing={3}>
      <PageHeader title="Transactions">
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <Button
            variant="outlined"
            startIcon={<AccountBalanceOutlinedIcon />}
            endIcon={<KeyboardArrowDownIcon />}
            onClick={(event) => setAccountMenuAnchorEl(event.currentTarget)}
            sx={[filterButtonSx(selectedAccount !== null), { maxWidth: { xs: "50%", sm: 240 } }]}
          >
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedAccount ? selectedAccount.name : "All accounts"}
            </Box>
          </Button>

          <Button
            variant="outlined"
            startIcon={<CalendarMonthOutlinedIcon />}
            endIcon={<KeyboardArrowDownIcon />}
            onClick={(event) => setDateRangeAnchorEl(event.currentTarget)}
            sx={filterButtonSx(hasDateRange)}
          >
            {dateRangeLabel}
          </Button>
        </Stack>
      </PageHeader>

      {/* Account menu */}
      <Menu
        anchorEl={accountMenuAnchorEl}
        open={accountMenuOpen}
        onClose={() => setAccountMenuAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 260 } } }}
      >
        <MenuItem
          selected={selectedAccount === null}
          onClick={() => {
            setSelectedAccountId(null);
            setAccountMenuAnchorEl(null);
          }}
        >
          <ListItemText>All accounts</ListItemText>
          {selectedAccount === null && <CheckRoundedIcon sx={{ fontSize: 18, color: "primary.main", ml: 1 }} />}
        </MenuItem>

        {selectableAccounts.map((account) => (
          <MenuItem
            key={account.id}
            selected={selectedAccountId === account.id}
            onClick={() => {
              setSelectedAccountId(account.id);
              setAccountMenuAnchorEl(null);
            }}
          >
            <ListItemText>{account.name}</ListItemText>
            {selectedAccountId === account.id && <CheckRoundedIcon sx={{ fontSize: 18, color: "primary.main", ml: 1 }} />}
          </MenuItem>
        ))}

        {selectableAccounts.length === 0 && <MenuItem disabled>No accounts yet</MenuItem>}
      </Menu>

      {/* Date range menu: presets, plus a custom range */}
      <Menu
        anchorEl={dateRangeAnchorEl}
        open={dateRangeOpen}
        onClose={() => setDateRangeAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 240 } } }}
      >
        {DATE_RANGE_PRESETS.map((option) => (
          <MenuItem
            key={option.value}
            selected={dateRangePreset === option.value}
            onClick={() => {
              setDateRangePreset(option.value);
              // Presets apply at once; Custom stays open for its dates.
              if (option.value !== "custom") setDateRangeAnchorEl(null);
            }}
          >
            <ListItemText>{option.label}</ListItemText>
            {dateRangePreset === option.value && <CheckRoundedIcon sx={{ fontSize: 18, color: "primary.main", ml: 1 }} />}
          </MenuItem>
        ))}

        {dateRangePreset === "custom" && (
          <Box key="custom-range-fields" sx={{ px: 2, pt: 0.5, pb: 2 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1.5}>
              <TextField
                label="From"
                type="date"
                size="small"
                value={customDateFrom}
                onChange={(event) => setCustomDateFrom(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="To"
                type="date"
                size="small"
                value={customDateTo}
                onChange={(event) => setCustomDateTo(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={() => setDateRangeAnchorEl(null)}
                disabled={!customDateFrom && !customDateTo}
              >
                Apply
              </Button>
            </Stack>
          </Box>
        )}
      </Menu>

      {/* Totals for the account and dates above. Search and the filters below don't move them. */}
      <StatStrip
        stats={[
          {
            label: "Money in",
            value: formatCurrency(summary.inflows),
            caption: plural(summary.inflowCount, "transaction", "transactions"),
            tone: "positive",
          },
          {
            label: "Money out",
            value: formatCurrency(summary.outflows),
            caption: plural(summary.outflowCount, "transaction", "transactions"),
          },
          {
            label: "Net",
            value: formatSignedCurrency(summary.net),
            caption: "Transfers between your accounts left out",
            tone: summary.net > 0 ? "positive" : summary.net < 0 ? "negative" : undefined,
          },
        ]}
      />

      {/* One row: money in or out, search, and filters */}
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between" }}
        >
          <Tabs
            value={flowFilter}
            onChange={(_event, value) => setFlowFilter(value as FlowFilter)}
            variant="scrollable"
            scrollButtons={false}
          >
            {FLOW_FILTER_TABS.map((tab) => (
              <Tab
                key={tab.value}
                value={tab.value}
                label={tab.value === "review" && reviewCount > 0 ? `${tab.label} (${reviewCount})` : tab.label}
              />
            ))}
          </Tabs>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <TextField
              size="small"
              placeholder="Search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: "text.disabled", fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchTerm ? (
                    <InputAdornment position="end">
                      <IconButton size="small" aria-label="Clear search" onClick={() => setSearchTerm("")} edge="end">
                        <CloseRoundedIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
                htmlInput: { "aria-label": "Search transactions" },
              }}
              sx={{ flex: 1, width: { md: 260 } }}
            />
            <Button
              variant="outlined"
              startIcon={<FilterListIcon />}
              onClick={(event) => setFiltersAnchorEl(event.currentTarget)}
              sx={filterButtonSx(statusFilter !== "all" || Boolean(minAmount || maxAmount))}
            >
              Filters
            </Button>
          </Stack>
        </Stack>

        {activeFilters.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            {activeFilters.map((filter) => (
              <Chip
                key={filter.key}
                label={filter.label}
                onDelete={filter.onClear}
                size="small"
                variant="outlined"
                sx={{ bgcolor: "background.paper", fontWeight: 600, maxWidth: 260 }}
              />
            ))}
            <Button size="small" onClick={clearAllFilters}>
              Clear all
            </Button>
          </Stack>
        )}
      </Stack>

      <Menu
        anchorEl={filtersAnchorEl}
        open={filtersOpen}
        onClose={() => setFiltersAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1 } } }}
      >
        <Box sx={{ p: 2, width: 300, maxWidth: "calc(100vw - 32px)" }}>
          <Stack spacing={2}>
            <TextField
              select
              label="Status"
              size="small"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <MenuItem value="all">Pending and posted</MenuItem>
              <MenuItem value="pending">Pending only</MenuItem>
              <MenuItem value="posted">Posted only</MenuItem>
            </TextField>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Min amount"
                type="number"
                size="small"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
                slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
              />
              <TextField
                label="Max amount"
                type="number"
                size="small"
                value={maxAmount}
                onChange={(event) => setMaxAmount(event.target.value)}
                slotProps={{ htmlInput: { min: 0, step: "0.01" } }}
              />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
              <Button
                onClick={() => {
                  setStatusFilter("all");
                  setMinAmount("");
                  setMaxAmount("");
                }}
                sx={{ px: 1 }}
              >
                Reset
              </Button>
              <Button variant="contained" onClick={() => setFiltersAnchorEl(null)}>
                Done
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Menu>

      {transactionsError && (
        <Alert severity="error" onClose={() => setTransactionsError(null)}>
          {transactionsError}
        </Alert>
      )}

      {suggestionUpdates.length > 0 && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={handleAcceptAllSuggestions} disabled={acceptingAll} sx={{ whiteSpace: "nowrap" }}>
              {acceptingAll ? "Accepting…" : "Accept all"}
            </Button>
          }
        >
          Telos suggests a category for {plural(suggestionUpdates.length, "uncategorized transaction", "uncategorized transactions")}.
          Accept them below one at a time, or all at once.
        </Alert>
      )}

      {/* The list: a table from md up, cards below, both grouped by day */}
      {isLoading ? (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <ListSkeleton rows={8} />
        </Paper>
      ) : filteredTransactions.length === 0 ? (
        <Paper variant="outlined">
          {transactions.length === 0 && !hasActiveFilters ? (
            <EmptyState
              icon={<ReceiptLongOutlinedIcon />}
              title="No transactions yet"
              description="Connect a bank on Accounts, or add a manual account. New transactions appear here after each sync."
              action={
                <Button component={Link} href="/accounts" variant="contained">
                  Go to Accounts
                </Button>
              }
            />
          ) : flowFilter === "review" && activeFilters.length === 0 && !searchTerm.trim() ? (
            <EmptyState icon={<CheckCircleOutlineRoundedIcon />} title="All caught up" description="Every transaction has a category." />
          ) : (
            <EmptyState
              icon={<SearchIcon />}
              title="No matching transactions"
              description="Try a different search, or clear the filters."
              action={
                <Button
                  variant="outlined"
                  onClick={() => {
                    clearAllFilters();
                    setFlowFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          {/* Bulk actions for the selected transactions */}
          {selectedTransactions.length > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1.5,
                px: 2,
                py: 1.25,
                bgcolor: "#eff6ff",
                borderBottom: "1px solid",
                borderColor: "#bfdbfe",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.dark" }}>
                {selectedTransactions.length} selected
              </Typography>
              {selectedTransactions.length < filteredTransactions.length && (
                <Button size="small" onClick={() => setSelectedIds(new Set(filteredTransactions.map((tx) => tx.id)))}>
                  Select all {filteredTransactions.length}
                </Button>
              )}
              <Box sx={{ width: { xs: "100%", sm: 240 }, order: { xs: 1, sm: 0 } }}>
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
                startIcon={<VisibilityOffOutlinedIcon />}
                onClick={() => void handleBulkHidden(!allSelectedHidden)}
                disabled={bulkBusy}
              >
                {allSelectedHidden ? "Unhide" : "Hide"}
              </Button>
              <Button
                size="small"
                startIcon={<BoltIcon />}
                onClick={() => openRuleDialog(draftRuleFor(selectedTransactions))}
                disabled={bulkBusy}
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
              {groups.map((group, groupIndex) => (
                <Box key={`${group.date}-${groupIndex}`}>
                  <DayHeading>{dateHeading(group.date)}</DayHeading>
                  {group.items.map((tx) => {
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
                          borderBottom: "1px solid",
                          borderColor: "grey.100",
                          cursor: "pointer",
                          opacity: tx.hidden ? 0.55 : 1,
                          bgcolor: selected ? "#f8fbff" : "background.paper",
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
                          <Typography noWrap variant="body2" sx={{ fontWeight: 600 }}>
                            {tx.displayName}
                          </Typography>
                          <Typography noWrap variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                            {tx.originAccName}
                            {tx.pending ? " · Pending" : ""}
                          </Typography>
                          {category ? (
                            <Typography noWrap variant="caption" sx={{ color: "grey.600", display: "block", fontWeight: 600 }}>
                              {category.name}
                            </Typography>
                          ) : waiting ? (
                            <Typography noWrap variant="caption" sx={{ color: "primary.main", display: "block", fontWeight: 600 }}>
                              Needs review
                            </Typography>
                          ) : (
                            note && (
                              <Typography noWrap variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                {note}
                              </Typography>
                            )
                          )}
                        </Box>
                        <TransactionAmount amount={tx.amount} />
                      </Box>
                    );
                  })}
                </Box>
              ))}
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ pl: 1.5 }}>
                      <Checkbox
                        size="small"
                        checked={shownIds.length > 0 && shownSelectedCount === shownIds.length}
                        indeterminate={shownSelectedCount > 0 && shownSelectedCount < shownIds.length}
                        onChange={toggleShown}
                        slotProps={{ input: { "aria-label": "Select the transactions shown" } }}
                      />
                    </TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell sx={{ width: 52 }} />
                  </TableRow>
                </TableHead>

                <TableBody>
                  {groups.map((group, groupIndex) => (
                    <Fragment key={`${group.date}-${groupIndex}`}>
                      <TableRow>
                        <TableCell colSpan={6} sx={{ p: 0, borderBottom: 0 }}>
                          <DayHeading>{dateHeading(group.date)}</DayHeading>
                        </TableCell>
                      </TableRow>

                      {group.items.map((tx) => {
                        const suggestion =
                          !tx.categoryId && tx.suggestedCategoryId ? categoriesById.get(tx.suggestedCategoryId) : undefined;
                        const note = categoryNote(tx);
                        const selected = selectedIds.has(tx.id);

                        return (
                          <TableRow
                            key={tx.id}
                            hover
                            selected={selected}
                            sx={{ opacity: tx.hidden ? 0.55 : 1, "& td": { py: 1.25 } }}
                          >
                            <TableCell padding="checkbox" sx={{ pl: 1.5 }}>
                              <Checkbox
                                size="small"
                                checked={selected}
                                onChange={() => toggleSelected(tx.id)}
                                slotProps={{ input: { "aria-label": `Select ${tx.displayName}` } }}
                              />
                            </TableCell>

                            {/* Description: opens the detail drawer */}
                            <TableCell onClick={() => setDrawerTxId(tx.id)} sx={{ cursor: "pointer" }}>
                              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                                <MerchantAvatar name={tx.displayName} logoUrl={tx.logoUrl} />
                                <Box sx={{ minWidth: 0 }}>
                                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                                      {tx.displayName}
                                    </Typography>
                                    {tx.pending && (
                                      <Chip label="Pending" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.68rem" }} />
                                    )}
                                  </Stack>
                                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                    {tx.notes
                                      ? tx.notes
                                      : plaidCategoryLabel(tx.plaidCategoryDetailed ?? tx.plaidCategoryPrimary) || "No bank category"}
                                  </Typography>
                                </Box>
                              </Stack>
                            </TableCell>

                            <TableCell>
                              <Typography variant="body2" sx={{ color: "grey.700" }}>
                                {tx.originAccName || "Bank account"}
                              </Typography>
                            </TableCell>

                            <TableCell sx={{ minWidth: 210 }}>
                              <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                                <Box sx={{ width: 210, "& .MuiAutocomplete-inputRoot": { py: "1px", fontSize: "0.8rem" } }}>
                                  <CategoryPicker
                                    categories={categories}
                                    value={tx.categoryId ?? null}
                                    onChange={(categoryId) => void handleCategoryChange(tx, categoryId ?? "")}
                                    placeholder="Needs review"
                                    exclude={excludeOwnTransfer(tx)}
                                  />
                                </Box>
                                {suggestion ? (
                                  <Chip
                                    size="small"
                                    icon={<CheckRoundedIcon sx={{ fontSize: 14 }} />}
                                    label={`Suggested: ${suggestion.name}`}
                                    onClick={() => acceptSuggestion(tx)}
                                    sx={{ height: 22, fontSize: "0.72rem", bgcolor: "#eff6ff", color: "primary.main", "& .MuiChip-icon": { color: "inherit" } }}
                                  />
                                ) : (
                                  note && (
                                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                      {note}
                                    </Typography>
                                  )
                                )}
                              </Stack>
                            </TableCell>

                            <TableCell align="right">
                              <TransactionAmount amount={tx.amount} />
                            </TableCell>

                            <TableCell align="center">
                              <IconButton size="small" aria-label="Details" onClick={() => setDrawerTxId(tx.id)} sx={{ color: "text.secondary" }}>
                                <MoreHorizIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* How many are shown, and more */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
              px: 2.5,
              py: 1.5,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Showing {visibleTransactions.length} of {filteredTransactions.length}
            </Typography>
            {visibleTransactions.length < filteredTransactions.length ? (
              <Button onClick={showMore}>Show more</Button>
            ) : (
              hasOlderTransactions && (
                <Button
                  onClick={() => {
                    showMore();
                    loadOlderTransactions();
                  }}
                >
                  Load older transactions
                </Button>
              )
            )}
          </Box>
        </Paper>
      )}

      {!isLoading && filteredTransactions.length === 0 && hasOlderTransactions && (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Button onClick={loadOlderTransactions}>Load older transactions</Button>
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

      <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)}>
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

/** A day's heading in the list: "Today", "Yesterday", or "Mon, Nov 24". */
function DayHeading({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        px: 2,
        py: 0.75,
        bgcolor: "grey.50",
        borderBottom: "1px solid",
        borderColor: "divider",
        color: "text.secondary",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {children}
    </Box>
  );
}

/** The look of a filter button: plain until it filters something, then tinted. */
function filterButtonSx(active: boolean) {
  return {
    whiteSpace: "nowrap",
    flexShrink: 0,
    color: active ? "primary.main" : "text.primary",
    bgcolor: active ? "#eff6ff" : "background.paper",
    borderColor: active ? "#bfdbfe" : "divider",
    "& .MuiButton-startIcon": { color: active ? "primary.main" : "text.secondary" },
    "&:hover": { borderColor: active ? "#93c5fd" : "grey.300", bgcolor: active ? "#eff6ff" : "grey.50" },
  } as const;
}
