"use client";

import useAuth from "@/lib/hooks/useAuth";
import { useAccounts } from "@/lib/hooks/useAccounts";
import useTransactions from "@/lib/hooks/useTransactions";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

// Icons
import SyncIcon from "@mui/icons-material/Sync";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import SouthWestIcon from "@mui/icons-material/SouthWest";
import NorthEastIcon from "@mui/icons-material/NorthEast";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import DirectionsCarFilledOutlinedIcon from "@mui/icons-material/DirectionsCarFilledOutlined";
import LocalGasStationOutlinedIcon from "@mui/icons-material/LocalGasStationOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";

import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  Select,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const MAX_VISIBLE_PAGES = 7;
const PAGINATION_WINDOW = 1;

type StatusFilter = "all" | "pending" | "posted";

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

function getCategoryStyle(category: string = "") {
  const c = category.toLowerCase();

  if (c.includes("shop")) {
    return { color: "#2563eb", icon: <ShoppingCartOutlinedIcon sx={{ fontSize: 16 }} /> };
  }
  if (c.includes("entertain") || c.includes("subscription")) {
    return { color: "#7c3aed", icon: <MusicNoteOutlinedIcon sx={{ fontSize: 16 }} /> };
  }
  if (c.includes("income") || c.includes("payroll") || c.includes("deposit")) {
    return { color: "#16a34a", icon: <PaidOutlinedIcon sx={{ fontSize: 16 }} /> };
  }
  if (c.includes("auto") || c.includes("transport") || c.includes("gas")) {
    return { color: "#ea580c", icon: <DirectionsCarFilledOutlinedIcon sx={{ fontSize: 16 }} /> };
  }
  if (c.includes("financ") || c.includes("interest") || c.includes("bank")) {
    return { color: "#2563eb", icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 16 }} /> };
  }

  return { color: "#64748b", icon: <LabelOutlinedIcon sx={{ fontSize: 16 }} /> };
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "..."> = [1];
  const windowStart = Math.max(2, currentPage - PAGINATION_WINDOW);
  const windowEnd = Math.min(totalPages - 1, currentPage + PAGINATION_WINDOW);

  if (windowStart > 2) {
    items.push("...");
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    items.push(page);
  }

  if (windowEnd < totalPages - 1) {
    items.push("...");
  }

  items.push(totalPages);
  return items;
}

function parseDateValue(dateValue: string) {
  const parsed = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export default function TransactionsPage() {
  const { user, authLoading } = useAuth();
  const { accounts } = useAccounts(user, authLoading);
  const {
    transactions = [],
    transactionsLoading,
    transactionsError,
    setTransactionsError,
    refetchTransactions,
  } = useTransactions(user, authLoading, accounts);

  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [filtersAnchorEl, setFiltersAnchorEl] = useState<null | HTMLElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const filteredTransactions = useMemo(() => {
    const fromTime = dateFrom ? parseDateValue(dateFrom) : null;
    const toTime = dateTo ? parseDateValue(dateTo) : null;
    const min = minAmount === "" ? null : Number(minAmount);
    const max = maxAmount === "" ? null : Number(maxAmount);
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (normalizedSearch && !transaction.displayName.toLowerCase().includes(normalizedSearch)) return false;
      if (statusFilter === "pending" && !transaction.pending) return false;
      if (statusFilter === "posted" && transaction.pending) return false;

      const transactionTime = parseDateValue(transaction.date);
      if (fromTime !== null && transactionTime !== null && transactionTime < fromTime) return false;
      if (toTime !== null && transactionTime !== null && transactionTime > toTime) return false;

      const amount = Math.abs(transaction.amount);
      if (min !== null && !Number.isNaN(min) && amount < min) return false;
      if (max !== null && !Number.isNaN(max) && amount > max) return false;

      return true;
    });
  }, [transactions, searchTerm, dateFrom, dateTo, statusFilter, minAmount, maxAmount]);
  const hasActiveFilters = Boolean(searchTerm || dateFrom || dateTo || statusFilter !== "all" || minAmount || maxAmount);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const paginatedTransactions = filteredTransactions.slice((currentPageSafe - 1) * pageSize, currentPageSafe * pageSize);
  const paginationItems = buildPaginationItems(currentPageSafe, totalPages);
  const filtersOpen = Boolean(filtersAnchorEl);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo, statusFilter, minAmount, maxAmount, pageSize]);

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
          <Typography variant="body2" sx={{ color: "#64748b", mt: 0.5, fontSize: "0.9rem" }}>
            Review and track your transactions across all connected accounts.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Button
            variant="outlined"
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
            startIcon={<AccountBalanceOutlinedIcon sx={{ color: "#0284c7", fontSize: 18 }} />}
            sx={{
              borderColor: "#e2e8f0",
              color: "#334155",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              bgcolor: "#fff",
              px: 1.75,
              py: 0.85,
              boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.04)",
              "&:hover": { borderColor: "#cbd5e1", bgcolor: "#f8fafc" },
            }}
          >
            All Accounts
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

          <Button
            variant="contained"
            disableElevation
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18 }} />}
            startIcon={<FileUploadOutlinedIcon sx={{ fontSize: 18 }} />}
            sx={{
              bgcolor: "#2563eb",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              px: 1.75,
              py: 0.85,
              "&:hover": { bgcolor: "#1d4ed8" },
            }}
          >
            Export
          </Button>
        </Stack>
      </Stack>

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
              <Typography sx={{ fontWeight: 700, color: "#16a34a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>$4,250.00</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>28 transactions</Typography>
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
              <Typography sx={{ fontWeight: 700, color: "#dc2626", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>$3,950.76</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>42 transactions</Typography>
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
              <Typography sx={{ fontWeight: 700, color: "#0f172a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>$299.24</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>This month</Typography>
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
          justifyContent: "flex-end",
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
            <TextField
              label="From"
              type="date"
              size="small"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: "100%" }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: "100%" }}
            />
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
                setDateFrom("");
                setDateTo("");
                setStatusFilter("all");
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
                  const categoryStyle = getCategoryStyle(tx.categoryDetailed || tx.categoryPrimary || "");

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
                              {tx.categoryPrimary || "General Entry"}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* Account */}
                      <TableCell>
                        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                          <Typography sx={{ fontWeight: 500, color: "#334155", fontSize: "0.85rem" }}>
                            {tx.accountName || "Plaid Account"}
                          </Typography>
                          {/* <Chip
                            label={tx.accountType === "credit" ? "Credit Card" : "Cash"}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              bgcolor: tx.accountType === "credit" ? "#fef2f2" : "#f0fdf4",
                              color: tx.accountType === "credit" ? "#ef4444" : "#16a34a",
                              border: "none",
                              borderRadius: 1.25,
                            }}
                          /> */}
                        </Stack>
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Stack sx={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                          <Box sx={{ display: "flex", color: categoryStyle.color }}>{categoryStyle.icon}</Box>
                          <Typography sx={{ fontWeight: 600, fontSize: "0.8rem", color: categoryStyle.color }}>
                            {tx.categoryDetailed || tx.categoryPrimary || "Uncategorized"}
                          </Typography>
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
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.875rem", color: isExpense ? "#0f172a" : "#16a34a", pr: 3 }}>
                        {isExpense ? `-$${tx.amount.toFixed(2)}` : `+$${Math.abs(tx.amount).toFixed(2)}`}
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
              Showing {startItem} to {endItem} of {transactions.length} transactions
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
                    <Button
                      key={pageItem}
                      size="small"
                      variant={pageItem === currentPageSafe ? "outlined" : "text"}
                      onClick={() => setCurrentPage(pageItem)}
                      sx={{ minWidth: 30, height: 30, p: 0, borderRadius: 1.5, bgcolor: pageItem === currentPageSafe ? "#eff6ff" : "transparent", color: pageItem === currentPageSafe ? "#2563eb" : "#64748b", borderColor: pageItem === currentPageSafe ? "#bfdbfe" : "transparent", fontWeight: 600, fontSize: "0.85rem" }}
                    >
                      {pageItem}
                    </Button>
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

      <Snackbar
        open={syncSuccess}
        autoHideDuration={4000}
        onClose={() => setSyncSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSyncSuccess(false)} sx={{ borderRadius: 2.5 }}>
          Account transaction logs verified and updated successfully.
        </Alert>
      </Snackbar>
    </Stack>
  );
}