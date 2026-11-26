"use client";

import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import usePlaidAccountLink from "@/lib/hooks/usePlaidAccountLink";
import { fetchPlaidUsage, runSync, type PlaidUsage } from "@/lib/plaidSync";
import type { Account, AccountType, NormalBalance } from "@/lib/types/types";
import { formatCurrency } from "@/lib/utils";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import PieChartRoundedIcon from "@mui/icons-material/PieChartRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import UnarchiveRoundedIcon from "@mui/icons-material/UnarchiveRounded";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
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
  Typography
} from "@mui/material";
import ContributionEligibilityPromptDialog from "./ContributionEligibilityPromptDialog";
import { useEffect, useMemo, useState } from "react";
import AccountFormDialog from "./AccountFormDialog";
import DeleteAccountDialog from "./DeleteAccountDialog";
import IsolationWarningDialog from "@/components/IsolationWarningDialog";
import { accountTypeStyles } from "./accountTypes";
import ConnectBankDialog from "./ConnectBankDialog";
import ConnectionsPanel from "./ConnectionsPanel";
import { LinkConfirmDialog, PlaidReconnectButton } from "./plaidLinkButton";

type ViewFilter = "active" | "archived";

export default function AccountsPage() {
  const { user, authLoading } = useAuth();  
  const { accounts, accountsLoading, itemsNeedingReauth, connections, addManualAccount, updateAccount, archiveAccount, checkAccountIsolation, deleteAccount, disconnectBank } = useAccounts(user, authLoading);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteDialogAccount, setDeleteDialogAccount] = useState<Account | null>(null);
  const [deleteSuccessNotice, setDeleteSuccessNotice] = useState(false);

  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [usage, setUsage] = useState<PlaidUsage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEditingAccount, setSelectedEditingAccount] = useState<Account | null>(null);

  const [viewFilter, setViewFilter] = useState<ViewFilter>("active");

  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const addMenuOpen = Boolean(addMenuAnchor);

  const [contributionPromptAccounts, setContributionPromptAccounts] = useState<{ id: string; name: string }[]>([]);
  const [isSavingContributionPrompt, setIsSavingContributionPrompt] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState(0);

  // Plaid connections used so far, for the Connect a bank step and the bank cards.
  function refreshUsage() {
    fetchPlaidUsage()
      .then(setUsage)
      .catch((usageError: unknown) => console.error(usageError));
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchPlaidUsage()
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch((usageError: unknown) => console.error(usageError));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Connect a bank. The dialog closes as Link opens, because its focus trap blocks Link.
  const connectLink = usePlaidAccountLink({
    onAccountsLinked: (linked, skippedDuplicateCount, reattachedCount) => {
      setContributionPromptAccounts(linked.map((a) => ({ id: a.id, name: a.name })));
      setDuplicateNotice(skippedDuplicateCount);
      if (reattachedCount > 0) {
        setNotice(
          reattachedCount === 1
            ? "An account from an earlier connection was reattached with its history."
            : `${reattachedCount} accounts from an earlier connection were reattached with their history.`
        );
      }
      refreshUsage();
    },
    onLinkError: (message) => setError(message),
    onOpen: () => setConnectDialogOpen(false),
  });

  function openConnectDialog() {
    setConnectDialogOpen(true);
    refreshUsage();
  }

  function closeContributionPrompt() {
    setContributionPromptAccounts([]);
  }

  async function handleContributionPromptConfirm(selections: Record<string, boolean>) {
    try {
      setIsSavingContributionPrompt(true);
      await Promise.all(
        Object.entries(selections).map(([id, eligible]) =>
          updateAccount(id, { isContributionEligible: eligible })
        )
      );
    } catch (saveError) {
      console.error(saveError);
      setError("Could not save contribution eligibility for the new account(s).");
    } finally {
      setIsSavingContributionPrompt(false);
      closeContributionPrompt();
    }
  }

  function handleContributionPromptSkip() {
    closeContributionPrompt();
  }

  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuAccountId, setRowMenuAccountId] = useState<string | null>(null);

  // Pre-archive warning flow — reuses the same checkAccountIsolation already
  // used to gate permanent deletion, but here it's informational only: if
  // it finds references, the user gets a confirmable warning instead of
  // being blocked outright (archiving is reversible via "Restore").
  const [isolationCheckAccount, setIsolationCheckAccount] = useState<Account | null>(null);
  const [isolationReasons, setIsolationReasons] = useState<string[]>([]);
  const [isCheckingIsolation, setIsCheckingIsolation] = useState(false);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);

  const activeAccounts = useMemo(() => accounts.filter((account) => !account.isArchived), [accounts]);
  const archivedAccounts = useMemo(() => accounts.filter((account) => account.isArchived), [accounts]);

  const baseFilteredAccounts = useMemo(() => {
    if (viewFilter === "active") return activeAccounts;
    if (viewFilter === "archived") return archivedAccounts;
    return accounts;
  }, [viewFilter, accounts, activeAccounts, archivedAccounts]);

  const accountSummary = useMemo(() => {
    let assetTotal = 0;
    let liabilityTotal = 0;

    for (const account of activeAccounts) {
      const balance = account.currentBalance ?? account.startingBalance ?? 0;
      if (account.normalBalance === "asset") {
        assetTotal += balance;
      } else {
        liabilityTotal += balance;
      }
    }

    return {
      assetCount: activeAccounts.filter((account) => account.normalBalance === "asset").length,
      liabilityCount: activeAccounts.filter((account) => account.normalBalance === "liability").length,
      assetTotal,
      liabilityTotal,
      netWorth: assetTotal - liabilityTotal,
      totalCount: accounts.length,
      activeCount: activeAccounts.length,
      archivedCount: archivedAccounts.length,
    };
  }, [activeAccounts, accounts, archivedAccounts.length]);

  const handleOpenAddForm = () => {
    setSelectedEditingAccount(null);
    setDialogOpen(true);
  };

  const handleOpenEditForm = (account: Account) => {
    setSelectedEditingAccount(account);
    setDialogOpen(true);
  };

  const handleSaveAccountForm = async (formData: {
    name: string;
    accountType: AccountType;
    normalBalance: NormalBalance;
    balance: number;
    isContributionEligible: boolean;
  }) => {
    if (Number.isNaN(formData.balance)) {
      setError("Balance must be a valid number.");
      return;
    }

    const normalizedName = formData.name.trim().toLowerCase();

    const isDuplicate = accounts.some(
      (a) =>
        !a.isArchived &&
        a.id !== selectedEditingAccount?.id &&
        a.name.trim().toLowerCase() === normalizedName
    );
    if (isDuplicate) {
      setError(`An account named "${formData.name.trim()}" already exists.`);
      return;
    }

    try {
      setError(null);
      setIsSaving(true);

      if (selectedEditingAccount) {
        // Safe Update Logic Configuration
        const payload: Partial<Account> = {
          name: formData.name,
          accountType: formData.accountType,
          normalBalance: formData.normalBalance,
          isContributionEligible: formData.isContributionEligible,
        };

        // Disallow updating balances manually if the account is a Synced Plaid account
        if (!selectedEditingAccount.plaidItemId) {
          payload.startingBalance = formData.balance;
          payload.currentBalance = formData.balance;
        }

        await updateAccount(selectedEditingAccount.id, payload);
      } else {
        const newAccountId = await addManualAccount({
          name: formData.name,
          accountType: formData.accountType,
          normalBalance: formData.normalBalance,
          startingBalance: formData.balance,
          isContributionEligible: formData.isContributionEligible,
        });
        setContributionPromptAccounts([{ id: newAccountId, name: formData.name.trim() }]);
      }

      setDialogOpen(false);
      setSelectedEditingAccount(null);
    } catch (saveError) {
      console.error(saveError);
      setError("Could not complete requested update operation.");
    } finally {
      setIsSaving(false);
    }
  };

  // Actually performs the archive (used both for the "no references found"
  // fast path and after the user confirms the warning dialog).
  async function runArchiveAccount(accountId: string) {
    try {
      setError(null);
      await archiveAccount(accountId);
    } catch (archiveError) {
      console.error(archiveError);
      setError("Could not archive account.");
    }
  }

  async function handleArchiveAccount(accountId: string) {
    setError(null);
    setIsCheckingIsolation(true);
    try {
      const result = await checkAccountIsolation(accountId);
      if (result.isIsolated) {
        await runArchiveAccount(accountId);
      } else {
        // Don't archive yet — same checkAccountIsolation used to gate
        // permanent deletion, but here it's a confirmable warning rather
        // than a hard block (see IsolationWarningDialog).
        const account = accounts.find((a) => a.id === accountId) ?? null;
        setIsolationCheckAccount(account);
        setIsolationReasons(result.reasons);
      }
    } catch (checkError) {
      console.error(checkError);
      setError("Could not check what's connected to this account before archiving.");
    } finally {
      setIsCheckingIsolation(false);
    }
  }

  async function handleConfirmArchiveFromDialog() {
    if (!isolationCheckAccount) return;
    setIsConfirmingArchive(true);
    await runArchiveAccount(isolationCheckAccount.id);
    setIsConfirmingArchive(false);
    setIsolationCheckAccount(null);
    setIsolationReasons([]);
  }

  function handleCancelArchiveDialog() {
    setIsolationCheckAccount(null);
    setIsolationReasons([]);
  }

  async function handleRestoreAccount(account: Account) {
    try {
      setError(null);
      await updateAccount(account.id, { isArchived: false });
    } catch (restoreError) {
      console.error(restoreError);
      setError("Could not restore account.");
    }
  }

  function handleOpenRowMenu(event: React.MouseEvent<HTMLElement>, accountId: string) {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuAccountId(accountId);
  }

  function handleCloseRowMenu() {
    setRowMenuAnchor(null);
    setRowMenuAccountId(null);
  }

  // Syncs every bank, which also refreshes balances; the account listener shows them.
  const [refreshing, setRefreshing] = useState(false);
  async function handleRefreshBalances() {
    setRefreshing(true);
    setError(null);
    try {
      const summary = await runSync();
      const problems = summary.itemsNeedingReauth.length + summary.itemsFailed.length;
      if (problems > 0) {
        setError(`${problems === 1 ? "A bank" : `${problems} banks`} couldn't sync. See Bank connections below.`);
      }
    } catch (refreshError) {
      console.error(refreshError);
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh balances.");
    } finally {
      setRefreshing(false);
    }
  }

  const rowMenuAccount = accounts.find((a) => a.id === rowMenuAccountId) ?? null;

  return (
    <Stack spacing={3} sx={{ p: 4, bgcolor: "#f8fafc", minHeight: "100vh" }}>
      {/* Header */}
      <PageHeader title="Accounts">
        <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0, alignItems: "center", flexWrap: "wrap", rowGap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={<SyncRoundedIcon sx={{ color: "#2563eb", fontSize: 18 }} />}
            onClick={handleRefreshBalances}
            disabled={refreshing}
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
              whiteSpace: "nowrap",
              "&:hover": { borderColor: "#93c5fd", bgcolor: "#eff6ff" },
            }}
          >
            Refresh Balances
          </Button>

          <Button
            variant="contained"
            disableElevation
            startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
            endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={(event) => setAddMenuAnchor(event.currentTarget)}
            sx={{
              bgcolor: "#2563eb",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              px: 1.75,
              py: 0.85,
              whiteSpace: "nowrap",
              "&:hover": { bgcolor: "#1d4ed8" },
            }}
          >
            Add Account
          </Button>

          <Menu
            anchorEl={addMenuAnchor}
            open={addMenuOpen}
            keepMounted
            onClose={() => setAddMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1,
                  borderRadius: 3,
                  width: 320,
                  border: "1px solid",
                  borderColor: "divider",
                },
              },
            }}
          >
            <Box sx={{ px: 1.5, py: 1 }}>
              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  openConnectDialog();
                }}
                sx={{ borderRadius: 2, py: 1.25, alignItems: "flex-start", gap: 1.5 }}
              >
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: "#eef2ff", color: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AccountBalanceRoundedIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Connect a Bank
                  </Typography>
                </Box>
                <ChevronRightRoundedIcon sx={{ ml: "auto", color: "text.disabled", flexShrink: 0 }} />
              </MenuItem>

              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  handleOpenAddForm();
                }}
                sx={{ borderRadius: 2, py: 1.25, alignItems: "flex-start", gap: 1.5 }}
              >
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: "#ecfdf5",
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <EditNoteRoundedIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Add Manually
                  </Typography>
                </Box>
                <ChevronRightRoundedIcon sx={{ ml: "auto", color: "text.disabled", flexShrink: 0 }} />
              </MenuItem>
            </Box>
          </Menu>

        </Stack>
      </PageHeader>

      {error && (
        <Snackbar open autoHideDuration={5000} onClose={() => setError(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
          <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ borderRadius: 2.5 }}>
            {error}
          </Alert>
        </Snackbar>
      )}

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
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Assets</Typography>
              <Typography sx={{ fontWeight: 700, color: "#16a34a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
                {formatCurrency(accountSummary.assetTotal)}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                {accountSummary.assetCount} accounts
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "#f0fdf4", color: "#16a34a", width: 44, height: 44 }}>
              <TrendingUpRoundedIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Liabilities</Typography>
              <Typography sx={{ fontWeight: 700, color: "#dc2626", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
                -{formatCurrency(accountSummary.liabilityTotal)}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                {accountSummary.liabilityCount} accounts
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "#fef2f2", color: "#dc2626", width: 44, height: 44 }}>
              <TrendingDownRoundedIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Net Worth</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
                {formatCurrency(accountSummary.netWorth)}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                Across all active accounts
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "#f5f3ff", color: "#7c3aed", width: 44, height: 44 }}>
              <PieChartRoundedIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack sx={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Total Accounts</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", mt: 0.5, letterSpacing: "-0.02em", fontSize: "1.5rem" }}>
                {accountSummary.totalCount}
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
                {accountSummary.archivedCount} archived
              </Typography>
            </Box>
            <Avatar sx={{ bgcolor: "#eff6ff", color: "#2563eb", width: 44, height: 44 }}>
              <CreditCardRoundedIcon sx={{ fontSize: 20 }} />
            </Avatar>
          </Stack>
        </Paper>
      </Box>

      <ConnectionsPanel
        connections={connections}
        accounts={accounts}
        usage={usage}
        onDisconnect={async (itemId) => {
          await disconnectBank(itemId);
          refreshUsage();
        }}
        onError={setError}
        onNotice={setNotice}
        onNewAccounts={(added) => setContributionPromptAccounts(added)}
      />

      {/* 3. Accounts Data Grid Core View */}
      <Tabs
        value={viewFilter}
        onChange={(_e, v: ViewFilter) => setViewFilter(v)}
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
        <Tab
          value="active"
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
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box>Active</Box>
              <Chip size="small" label={accountSummary.activeCount} />
            </Box>
          }
        />
        <Tab
          value="archived"
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
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box>Archived</Box>
              <Chip size="small" label={accountSummary.archivedCount} />
            </Box>
          }
        />
      </Tabs>
      
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", bgcolor: "#fff", borderColor: "#e2e8f0" }}>
        {accountsLoading ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: "#64748b" }}>Loading...</Typography>
          </Box>
        ) : baseFilteredAccounts.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: "#64748b" }}>No accounts found.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ borderBottom: "1px solid #e2e8f0" }}>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Account</TableCell>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem" }}>Balance</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 500, color: "#94a3b8", py: 1.75, fontSize: "0.8rem", pr: 3 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {baseFilteredAccounts.map((account) => {
                  const styleConfig = accountTypeStyles[account.accountType] || { label: account.accountType, color: "#64748b" };
                  const balance = account.currentBalance ?? account.startingBalance ?? 0;
                  const needsReauth = Boolean(account.plaidItemId && itemsNeedingReauth.has(account.plaidItemId));

                  return (
                    <TableRow key={account.id} sx={{ "&:hover": { backgroundColor: "#f8fafc" }, "& td": { py: 1.75, borderBottom: "1px solid #f1f5f9" } }}>
                      <TableCell sx={{ fontWeight: 600, color: "#0f172a", fontSize: "0.875rem" }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <Box component="span">{account.name}</Box>
                          {needsReauth ? (
                            <PlaidReconnectButton itemId={account.plaidItemId!} onLinkError={setError} />
                          ) : account.plaidItemId && account.isArchived ? (
                            <ArchiveRoundedIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                          ) : account.plaidItemId ? (
                            <SyncRoundedIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                          ) : null}
                          {account.plaidClosed && (
                            <Chip
                              label="Not shared"
                              size="small"
                              sx={{ height: 20, fontSize: "0.68rem", fontWeight: 600, color: "#b45309", bgcolor: "#fffbeb", borderRadius: 1.5 }}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={styleConfig.label}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            color: styleConfig.color,
                            bgcolor: `${styleConfig.color}10`,
                            borderRadius: 1.5,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: account.normalBalance === "liability" ? "#dc2626" : "#0f172a" }}>
                        {formatCurrency(balance)}
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 3 }}>
                        <IconButton size="small" sx={{ color: "#94a3b8" }} onClick={(e) => handleOpenRowMenu(e, account.id)}>
                          <MoreHorizRoundedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <DeleteAccountDialog
        open={deleteDialogAccount !== null}
        accountId={deleteDialogAccount?.id ?? null}
        accountName={deleteDialogAccount?.name ?? ""}
        onClose={() => setDeleteDialogAccount(null)}
        onCheckIsolation={checkAccountIsolation}
        onConfirmDelete={async (id) => {
          await deleteAccount(id);
          setDeleteSuccessNotice(true);
        }}
      />

      <IsolationWarningDialog
        open={isolationCheckAccount !== null}
        entityLabel="account"
        entityName={isolationCheckAccount?.name ?? ""}
        reasons={isolationReasons}
        isProcessing={isConfirmingArchive}
        onCancel={handleCancelArchiveDialog}
        onConfirm={handleConfirmArchiveFromDialog}
      />

      <Snackbar
        open={deleteSuccessNotice}
        autoHideDuration={4000}
        onClose={() => setDeleteSuccessNotice(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setDeleteSuccessNotice(false)} sx={{ borderRadius: 2.5 }}>
          Account deleted permanently.
        </Alert>
      </Snackbar>

      {/* Account Forms Dialog Popup Wrapper */}
      <AccountFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveAccountForm}
        isSaving={isSaving}
        editingAccount={selectedEditingAccount}
      />

      <ContributionEligibilityPromptDialog
        open={contributionPromptAccounts.length > 0}
        accounts={contributionPromptAccounts}
        isSaving={isSavingContributionPrompt}
        onConfirm={handleContributionPromptConfirm}
        onSkip={handleContributionPromptSkip}
      />

      <Snackbar
        open={duplicateNotice > 0}
        autoHideDuration={6000}
        onClose={() => setDuplicateNotice(0)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="info" variant="filled" onClose={() => setDuplicateNotice(0)} sx={{ borderRadius: 2.5 }}>
          {duplicateNotice} account{duplicateNotice === 1 ? "" : "s"} already linked — skipped.
        </Alert>
      </Snackbar>

      <ConnectBankDialog
        open={connectDialogOpen}
        onClose={() => setConnectDialogOpen(false)}
        connections={connections}
        accounts={accounts}
        usage={usage}
        link={connectLink}
      />

      <LinkConfirmDialog link={connectLink} />

      <Snackbar open={connectLink.finishing} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity="info" variant="filled" sx={{ borderRadius: 2.5 }}>
          Connecting your bank...
        </Alert>
      </Snackbar>

      <Snackbar
        open={notice !== null}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)} sx={{ borderRadius: 2.5 }}>
          {notice}
        </Alert>
      </Snackbar>

      {/* Row context Action options menu popup */}
      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu}>
        {rowMenuAccount && !rowMenuAccount.isArchived && (
          <MenuItem onClick={() => { handleOpenEditForm(rowMenuAccount); handleCloseRowMenu(); }} sx={{ gap: 1 }}>
            <EditRoundedIcon sx={{ fontSize: 16 }} /> Edit
          </MenuItem>
        )}
        {rowMenuAccount && !rowMenuAccount.isArchived ? (
          <MenuItem
            onClick={() => { handleArchiveAccount(rowMenuAccount.id); handleCloseRowMenu(); }}
            disabled={isCheckingIsolation}
            sx={{ gap: 1, color: "error.main" }}
          >
            <ArchiveRoundedIcon sx={{ fontSize: 16 }} /> Archive
          </MenuItem>
        ) : (
          rowMenuAccount && (
            <MenuItem onClick={() => { handleRestoreAccount(rowMenuAccount); handleCloseRowMenu(); }} sx={{ gap: 1, color: "success.main" }}>
              <UnarchiveRoundedIcon sx={{ fontSize: 16 }} /> Restore
            </MenuItem>
          )
        )}
        {rowMenuAccount && rowMenuAccount.isArchived && (
          <MenuItem
            onClick={() => {
              setDeleteDialogAccount(rowMenuAccount);
              handleCloseRowMenu();
            }}
            sx={{ gap: 1, color: "error.main" }}
          >
            <DeleteForeverRoundedIcon sx={{ fontSize: 16 }} /> Delete Permanently
          </MenuItem>
        )}
      </Menu>
    </Stack>
  );
}