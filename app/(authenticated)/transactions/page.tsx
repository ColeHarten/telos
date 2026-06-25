"use client";

import useAuth from "@/lib/hooks/useAuth";
import useTransactions from "@/lib/hooks/useTransactions";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import SyncIcon from "@mui/icons-material/Sync";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
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
} from "@mui/material";
import { useState } from "react";

export default function TransactionsPage() {
  const { user, authLoading } = useAuth();
  const {
    accountsWithTransactions,
    transactionsLoading,
    transactionsError,
    setTransactionsError,
    refetchTransactions,
  } = useTransactions(user, authLoading);

  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

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

  // Formatter for Plaid's detailed string (e.g. "FOOD_AND_DRINK_FAST_FOOD" -> "Fast Food")
  const formatCategoryLabel = (detailedStr?: string) => {
    if (!detailedStr) return "Uncategorized";
    const parts = detailedStr.split("_");
    // Strip parent category if it repeats, or clean up spacing
    return parts
      .slice(parts.length > 2 ? 2 : 1)
      .join(" ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <Stack spacing={2.25}>
      {/* Header Banner */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}>
            Transactions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review and track transaction metadata verified straight from your bank feeds.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
          onClick={handleSync}
          disabled={syncing || isLoading}
          sx={{ height: 40, borderRadius: 2, textTransform: "none", fontWeight: 700 }}
        >
          {syncing ? "Syncing..." : "Sync Transactions"}
        </Button>
      </Stack>

      {transactionsError && (
        <Alert severity="error" variant="soft" onClose={() => setTransactionsError(null)} sx={{ borderRadius: 2 }}>
          {transactionsError}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress size={36} />
        </Box>
      ) : accountsWithTransactions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Typography color="text.secondary" variant="body2">
            No transaction histories mapped yet.
          </Typography>
        </Paper>
      ) : (
        accountsWithTransactions.map((account) => (
          <Box key={account.accountId}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, mt: 1 }}>
              {account.name}
            </Typography>

            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", mb: 3 }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "#f8fafc" }}>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary", py: 1.25 }}>Merchant / Item</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary", py: 1.25 }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary", py: 1.25 }}>Channel</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary", py: 1.25 }}>Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: "text.secondary", py: 1.25 }}>Amount</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {account.transactions.map((tx) => (
                    <TableRow key={tx.id} hover>
                      {/* Name + Logo Cell */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <Avatar
                            src={tx.logoUrl || undefined}
                            alt={tx.name}
                            sx={{ width: 28, height: 28, bgcolor: "#f1f5f9", color: "text.secondary", border: "1px solid", borderColor: "divider" }}
                          >
                            <StorefrontRoundedIcon sx={{ fontSize: 16 }} />
                          </Avatar>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {tx.name}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* Category Badge Layout */}
                      <TableCell sx={{ py: 1.25 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          {tx.categoryIconUrl && (
                            <Box component="img" src={tx.categoryIconUrl} alt="category icon" sx={{ width: 16, height: 16 }} />
                          )}
                          <Typography variant="body2">
                            {formatCategoryLabel(tx.personalFinanceCategory?.detailed)}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* Payment Channel */}
                      <TableCell sx={{ py: 1.25, textTransform: "capitalize" }}>
                        <Chip label={tx.paymentChannel} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.75rem", color: "text.secondary" }} />
                      </TableCell>

                      {/* Date */}
                      <TableCell sx={{ py: 1.25 }}>
                        {new Date(tx.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </TableCell>

                      {/* Amount formatting */}
                      <TableCell
                        align="right"
                        sx={{
                          py: 1.25,
                          color: tx.amount > 0 ? "error.main" : "success.main",
                          fontWeight: 700,
                        }}
                      >
                        {tx.amount > 0
                          ? `-$${tx.amount.toFixed(2)}`
                          : `+$${Math.abs(tx.amount).toFixed(2)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ))
      )}

      <Snackbar
        open={syncSuccess}
        autoHideDuration={4000}
        onClose={() => setSyncSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSyncSuccess(false)} sx={{ borderRadius: 2 }}>
          Account transaction logs verified and updated successfully.
        </Alert>
      </Snackbar>
    </Stack>
  );
}