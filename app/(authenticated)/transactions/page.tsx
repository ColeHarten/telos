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
  MenuItem,
  Select,
} from "@mui/material";
import { useState } from "react";

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
  const [currentTab, setCurrentTab] = useState(0);

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
          justifyContent: "space-between",
          gap: 1.5,
          paddingBottom: 1,
          borderBottom: "1px solid #e2e8f0"
        }}
      >
        <Tabs
          value={currentTab}
          onChange={(_, val) => setCurrentTab(val)}
          sx={{
            minHeight: "auto",
            "& .MuiTabs-indicator": { bgcolor: "#2563eb", height: 2 },
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.875rem",
              minWidth: "auto",
              minHeight: "auto",
              px: 2,
              pb: 1.5,
              color: "#64748b",
              "&.Mui-selected": { color: "#2563eb" },
            },
          }}
        >
          <Tab label="All Transactions" />
          <Tab label="Inflows" />
          <Tab label="Outflows" />
          <Tab label="Transfers" />
        </Tabs>

        <Stack direction="row" spacing={1.5} sx={{ pb: 1.5 }}>
          <TextField
            size="small"
            placeholder="Search transactions..."
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
            sx={{
              borderColor: "#e2e8f0",
              color: "#334155",
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
      ) : transactions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 8, textAlign: "center", borderRadius: 3, borderStyle: "dashed", bgcolor: "#fff" }}>
          <Typography color="text.secondary" variant="body2">
            No transaction histories mapped yet.
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
                {transactions.map((tx) => {
                  const isExpense = tx.amount > 0;
                  const merchant = getMerchantAvatar(tx.displayName);
                  const categoryStyle = getCategoryStyle(tx.categoryDetailed || tx.categoryPrimary || undefined);

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
            sx={{ 
              display: "flex", 
              flexDirection: "row", 
              px: 3, py: 2, 
              borderTop: "1px solid #f1f5f9", 
              bgcolor: "#fff",
              alignItems: "center",
              spacing: 2,
            }}
          >
            <Typography variant="body2" sx={{ color: "#64748b", fontSize: "0.85rem" }}>
              Showing 1 to {Math.min(transactions.length, 10)} of {transactions.length} transactions
            </Typography>

            <Stack sx={{display: "flex", flexDirection: "row", alignItems: "center", gap: 1, ml: "auto"}}>
              <Stack sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 0.5 }}>
                <IconButton size="small" disabled sx={{ border: "1px solid #e2e8f0", borderRadius: 1.5, p: 0.5 }}>
                  <KeyboardArrowLeftIcon fontSize="small" />
                </IconButton>

                <Button size="small" variant="outlined" sx={{ minWidth: 30, height: 30, p: 0, borderRadius: 1.5, bgcolor: "#eff6ff", color: "#2563eb", borderColor: "#bfdbfe", fontWeight: 600, fontSize: "0.85rem" }}>
                  1
                </Button>
                <Button size="small" sx={{ minWidth: 30, height: 30, p: 0, color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>2</Button>
                <Button size="small" sx={{ minWidth: 30, height: 30, p: 0, color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>3</Button>
                <Button size="small" sx={{ minWidth: 30, height: 30, p: 0, color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>4</Button>
                <Button size="small" sx={{ minWidth: 30, height: 30, p: 0, color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>5</Button>

                <IconButton size="small" sx={{ border: "1px solid #e2e8f0", borderRadius: 1.5, p: 0.5 }}>
                  <KeyboardArrowRightIcon fontSize="small" />
                </IconButton>
              </Stack>

              <Select
                value={10}
                size="small"
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
                <MenuItem value={10}>10 per page</MenuItem>
                <MenuItem value={25}>25 per page</MenuItem>
                <MenuItem value={50}>50 per page</MenuItem>
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