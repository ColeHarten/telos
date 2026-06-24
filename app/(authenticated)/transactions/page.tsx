"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

type Transaction = {
  id: string;
  name: string;
  amount: number;
  date: string;
  category?: string[];
};

type Account = {
  accountId: string;
  name: string;
  transactions: Transaction[];
};

type SyncResponse = {
  accounts: Account[];
};

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTransactions() {
    setLoading(true);
    setError(null);

    try {
      const res = await authenticatedFetch("/api/plaid/sync", {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to fetch transactions");

      const data: SyncResponse = await res.json();
      setAccounts(data.accounts || []);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);

    try {
      const res = await authenticatedFetch("/api/plaid/sync", {
        method: "POST",
      });

      if (!res.ok) throw new Error("Sync failed");

      const data: SyncResponse = await res.json();
      setAccounts(data.accounts || []);
    } catch (err: any) {
      setError(err.message || "Sync error");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchTransactions();
  }, []);

  return (
    <Stack spacing={2.25}>
      <Stack
        spacing={2}
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Typography
        variant="h4"
        sx={{
            fontWeight: 700,
            letterSpacing: "-0.03em",
        }}
        >
            Transactions
        </Typography>

      </Stack>

    <Button
        variant="contained"
        startIcon={syncing ? <CircularProgress size={18} /> : <SyncIcon />}
        onClick={handleSync}
        disabled={syncing}
    >
        {syncing ? "Syncing..." : "Sync"}
    </Button>
    {error && (
    <Alert severity="error" sx={{ mb: 2 }}>
        {error}
    </Alert>
    )}

    {loading ? (
    <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress />
    </Box>
    ) : accounts.length === 0 ? (
    <Typography color="text.secondary">
        No transactions found.
    </Typography>
    ) : (
    accounts.map((account) => (
        <Box key={account.accountId} sx={{ mb: 5 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
            {account.name}
        </Typography>

        <TableContainer component={Paper} variant="outlined">
            <Table size="small">
            <TableHead>
                <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Category</strong></TableCell>
                <TableCell><strong>Date</strong></TableCell>
                <TableCell align="right"><strong>Amount</strong></TableCell>
                </TableRow>
            </TableHead>

            <TableBody>
                {account.transactions.map((tx) => (
                <TableRow key={tx.id}>
                    <TableCell>{tx.name}</TableCell>

                    <TableCell>
                    {tx.category?.[0] || "Uncategorized"}
                    </TableCell>

                    <TableCell>
                    {new Date(tx.date).toLocaleDateString()}
                    </TableCell>

                    <TableCell
                    align="right"
                    sx={{
                        color: tx.amount > 0 ? "error.main" : "success.main",
                        fontWeight: 600,
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
    </Stack>
  );
}