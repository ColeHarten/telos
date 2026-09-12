"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useAccounts } from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import { useCategories } from "@/lib/hooks/useCategories";
import useAutomations from "@/lib/hooks/useAutomations";
import useTransactions from "@/lib/hooks/useTransactions";
import AutomationPromptDialog from "./automationsPromptDialog";

// Icons
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import FilterListIcon from "@mui/icons-material/FilterList";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import LocalGasStationOutlinedIcon from "@mui/icons-material/LocalGasStationOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import NorthEastIcon from "@mui/icons-material/NorthEast";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import SouthWestIcon from "@mui/icons-material/SouthWest";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SyncIcon from "@mui/icons-material/Sync";

import {
  Alert,
  Avatar,
  Box,
  Button,
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
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const MAX_VISIBLE_PAGES = 5;

type StatusFilter = "all" | "pending" | "posted";
type DateRangePreset = "all" | "7d" | "30d" | "mtd" | "ytd" | "ltm" | "custom";
// "credit" = money coming in (i.e. tx.amount < 0 in this schema)
// "debit" = money going out (i.e. tx.amount > 0 in this schema)
type FlowFilter = "all" | "credit" | "debit";

const FLOW_FILTER_TABS: { value: FlowFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "credit", label: "Money In" },
  { value: "debit", label: "Money Out" },
];

const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "mtd", label: "This Month" },
  { value: "ytd", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

// ---- Presentation helpers (visual mapping only — data itself is untouched/placeholder) ----

function getMerchantAvatar(name: string = "") {
  const n = name.toLowerCase();

  if (n.includes("costco")) {
    return { bgcolor: "#dc2626", color: "#fff", icon: <ShoppingCartOutlinedIcon sx={{ fontSize: 18 }} /> };
  }
  if (n.includes("spotify")) {
    return { bgcolor: "#16a34a", color: "#fff", icon: <MusicNoteOutlinedIcon sx={{ fontSize: 18 }} /> };
  }
  if (n.includes("paycheck") || n.includes("payroll") || n.includes("deposit")) {
    return { bgcolor: "#2563eb", color: "#fff", icon: <PaidOutlinedIcon sx={{ fontSize: 18 }} /> };
  }
  if (n.includes("shell") || n.includes("gas") || n.includes("chevron") || n.includes("exxon")) {
    return { bgcolor: "#ea580c", color: "#fff", icon: <LocalGasStationOutlinedIcon sx={{ fontSize: 18 }} /> };
  }
  if (n.includes("netflix")) {
    return { bgcolor: "#dc2626", color: "#fff", icon: <MovieOutlinedIcon sx={{ fontSize: 18 }} /> };
  }
  if (n.includes("chase") || n.includes("bank")) {
    return { bgcolor: "#0f172a", color: "#fff", icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} /> };
  }

  // Fallback: neutral avatar with storefront icon
  return { bgcolor: "#f1f5f9", color: "#64748b", icon: <StorefrontOutlinedIcon sx={{ fontSize: 18 }} /> };
}


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

export default function TransactionsPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [] } = useAccounts(user, authLoading);
  const {
    transactions = [],
    transactionsLoading,
    transactionsError,
    setTransactionsError,
    refetchTransactions,
    updateTransactionAssignment,
  } = useTransactions(user, authLoading, accounts);

  const { categories = [] } = useCategories(user, authLoading);
  const { createAutomation } = useAutomations(user, authLoading);

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

  // Pending automation prompt — set right after a user manually assigns a
  // transaction's category, offering to turn that one-off choice into a
  // standing merchant -> category automation (see useAutomations).
  const [pendingAutomation, setPendingAutomation] = useState<{
    merchantLabel: string;
    categoryId: string;
    categoryLabel: string;
  } | null>(null);

  // Only offer active (non-archived) accounts in the account filter menu
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
      if (selectedAccountId && transaction.originAccId !== selectedAccountId) return false;

      const transactionTime = parseDateValue(transaction.date);
      if (fromTime !== null && transactionTime !== null && transactionTime < fromTime) return false;
      if (toTime !== null && transactionTime !== null && transactionTime > toTime) return false;

      return true;
    });
  }, [transactions, selectedAccountId, effectiveDateFrom, effectiveDateTo]);

  // List-only filters: search, status, amount. These narrow down the table
  // for finding specific transactions but should not move the summary cards.
  const filteredTransactions = useMemo(() => {
    const min = minAmount === "" ? null : Number(minAmount);
    const max = maxAmount === "" ? null : Number(maxAmount);
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return scopedTransactions.filter((transaction) => {
      if (normalizedSearch && !transaction.displayName.toLowerCase().includes(normalizedSearch)) return false;
      if (statusFilter === "pending" && !transaction.pending) return false;
      if (statusFilter === "posted" && transaction.pending) return false;
      if (flowFilter === "credit" && transaction.amount >= 0) return false;
      if (flowFilter === "debit" && transaction.amount < 0) return false;

      const amount = Math.abs(transaction.amount);
      if (min !== null && !Number.isNaN(min) && amount < min) return false;
      if (max !== null && !Number.isNaN(max) && amount > max) return false;

      return true;
    });
  }, [scopedTransactions, searchTerm, statusFilter, flowFilter, minAmount, maxAmount]);
  const hasActiveFilters = Boolean(searchTerm || hasDateRange || statusFilter !== "all" || flowFilter !== "all" || minAmount || maxAmount || selectedAccountId);

  // Summary metrics recompute from the top-tier scope only (account + date range),
  // so list-only filters like search/status/amount don't move the cards.
  const summary = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    let inflowCount = 0;
    let outflowCount = 0;

    for (const transaction of scopedTransactions) {
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
      const res = await authenticatedFetch("/api/plaid/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync operation failed");

      setSyncSuccess(true);
      await refetchTransactions();
    } catch (err: any) {
      setTransactionsError(err.message || "Sync error");
    } finally {
      setSyncing(false);
    }
  }

  /**
   * Applies a manual category assignment, then — if it succeeded — offers to
   * turn it into a standing automation (see AutomationPromptDialog below).
   * tx.displayName is merchantName ?? rawName, the same derivation the Plaid
   * sync job uses server-side (see ruleEngine.ts's applyRules), so the
   * automation's normalized key will match future transactions from the
   * same merchant.
   */
  async function handleCategoryChange(tx: (typeof transactions)[number], categoryId: string) {
    const category = categories.find((c) => c.id === categoryId);
    // compute CategoryKind from the selected categoryId, it can be "income"|"expense"|"transfer"
    const categoryKind = category?.kind;
    // Only meaningful for "transfer" categories — resolved here since this
    // page already has the full categories list.
    const transferAccountId = category?.kind === "transfer" ? category.transferAccountId ?? null : null;

    await updateTransactionAssignment(tx.id, categoryKind, categoryId, transferAccountId);

    if (!category) return;

    setPendingAutomation({
      merchantLabel: tx.displayName,
      categoryId,
      categoryLabel: category.name,
    });
  }

  const isLoading = authLoading || transactionsLoading;

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
    <Stack spacing={3} sx={{ p: 4, bgcolor: "#f8fafc", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>

      {/* 1. Header Toolbar Actions */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: "#0f172a", letterSpacing: "-0.03em", fontSize: "1.75rem" }}>
            Transactions
          </Typography>
        </Box>

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
            startIcon={syncing ? <CircularProgress size={14} color="inherit" /> : <SyncIcon sx={{ color: "#2563eb", fontSize: 18 }} />}
            onClick={handleSync}
            disabled={syncing || isLoading}
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
            {syncing ? "Syncing..." : "Sync Transactions"}
          </Button>
        </Stack>
      </Stack>

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
          selected={selectedAccountId === null}
          onClick={() => {
            setSelectedAccountId(null);
            setAccountMenuAnchorEl(null);
          }}
          sx={{ fontWeight: 600, fontSize: "0.85rem" }}
        >
          <ListItemText>All Accounts</ListItemText>
          {selectedAccountId === null && (
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
              <Typography sx={{ fontWeight: 700, color: "#0f172a", mt: 0.5, fontSize: "1.25rem" }}>Jul 1, 2026</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>7:13 AM</Typography>
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
          sx={{
            minHeight: 40,
            bgcolor: "#fff",
            borderRadius: 2,
            border: "1px solid #e2e8f0",
            p: 0.5,
            width: "fit-content",
            "& .MuiTabs-indicator": { display: "none" },
          }}
        >
          {FLOW_FILTER_TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={tab.label}
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

      {/* 4. Transactions Data Grid Core View */}
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 12 }}>
          <CircularProgress size={40} thickness={4} sx={{ color: "#2563eb" }} />
        </Box>
      ) : filteredTransactions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 8, textAlign: "center", borderRadius: 3, borderStyle: "dashed", bgcolor: "#fff" }}>
          <Typography color="text.secondary" variant="body2">
            {transactions.length === 0 && !hasActiveFilters ? "No transaction histories mapped yet." : "No transactions match the current filters."}
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ borderBottom: "1px solid #e2e8f0" }}>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>
                    Date <Box component="span" sx={{ fontSize: 11, ml: 0.25, color: "#cbd5e1" }}>↕</Box>
                  </TableCell>
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
                  const merchant = getMerchantAvatar(tx.displayName);

                  return (
                    <TableRow key={tx.id} sx={{ "&:hover": { backgroundColor: "#f8fafc" }, "& td": { py: 1.75, borderBottom: "1px solid #f1f5f9" } }}>

                      {/* Date */}
                      <TableCell sx={{ color: "#334155", fontWeight: 500, whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                        {formatDateString(tx.date)}
                      </TableCell>

                      {/* Description / Merchant */}
                      <TableCell>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                          <Avatar
                            sx={{ width: 34, height: 34, bgcolor: merchant.bgcolor, color: merchant.color }}
                          >
                            {merchant.icon}
                          </Avatar>
                          <Box>
                            <Typography sx={{ fontWeight: 600, color: "#0f172a", fontSize: "0.875rem", lineHeight: 1.3 }}>
                              {tx.displayName}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.75rem" }}>
                              {tx.plaidCategoryPrimary || "General Entry"}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* Account */}
                      <TableCell>
                        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                          <Typography sx={{ fontWeight: 500, color: "#334155", fontSize: "0.85rem" }}>
                            {tx.originAccName || "Plaid Account"}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Select
                          size="small"
                          value={tx.categoryId ?? ""}
                          onChange={(event) => handleCategoryChange(tx, event.target.value)}
                          displayEmpty
                          sx={{
                            minWidth: 160,
                            height: 32,
                            fontSize: "0.8rem",
                            bgcolor: "#fff",
                            "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
                          }}
                        >
                          {!tx.categoryId && (
                            <MenuItem value="" disabled sx={{ fontSize: "0.8rem" }}>
                              <em>Unassigned</em>
                            </MenuItem>
                          )}
                          {categories.map((category) => (
                            <MenuItem key={category.id} value={category.id} sx={{ fontSize: "0.8rem" }}>
                              {category.name}
                            </MenuItem>
                          ))}
                        </Select>
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
                        {isExpense ? `(${tx.amount.toFixed(2)})` : `${Math.abs(tx.amount).toFixed(2)}`}
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="center">
                        <IconButton size="small" sx={{ color: "#94a3b8" }}>
                          <MoreHorizIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

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

      <AutomationPromptDialog
        open={pendingAutomation !== null}
        merchantLabel={pendingAutomation?.merchantLabel ?? ""}
        cashflowLabel={pendingAutomation?.categoryLabel ?? ""}
        onDismiss={() => setPendingAutomation(null)}
        onConfirm={async () => {
          if (!pendingAutomation) return;
          await createAutomation(pendingAutomation.merchantLabel, pendingAutomation.categoryId);
          setPendingAutomation(null);
        }}
      />

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