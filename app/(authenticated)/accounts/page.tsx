"use client";

import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
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
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import UnarchiveRoundedIcon from "@mui/icons-material/UnarchiveRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  InputAdornment,
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
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AccountFormDialog from "./AccountFormDialog";
import { accountTypeStyles } from "./accountTypes";
import { PlaidLinkButton, type PlaidLinkRenderProps } from "./plaidLinkButton";

type ViewFilter = "active" | "archived";

export default function AccountsPage() {
  const { user, authLoading } = useAuth();
  const { accounts, accountsLoading, addManualAccount, updateAccount, archiveAccount } = useAccounts(user, authLoading);
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEditingAccount, setSelectedEditingAccount] = useState<Account | null>(null);

  const [viewFilter, setViewFilter] = useState<ViewFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");

  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const addMenuOpen = Boolean(addMenuAnchor);

  const [plaidTrigger, setPlaidTrigger] = useState<PlaidLinkRenderProps>({
    onClick: () => {},
    disabled: true,
    label: "Loading...",
  });

  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuAccountId, setRowMenuAccountId] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [user, accounts]);

  const activeAccounts = useMemo(() => accounts.filter((account) => !account.isArchived), [accounts]);
  const archivedAccounts = useMemo(() => accounts.filter((account) => account.isArchived), [accounts]);

  const baseFilteredAccounts = useMemo(() => {
    if (viewFilter === "active") return activeAccounts;
    if (viewFilter === "archived") return archivedAccounts;
    return accounts;
  }, [viewFilter, accounts, activeAccounts, archivedAccounts]);

  const displayedAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return baseFilteredAccounts.filter((account) => {
      return query.length === 0 || account.name.toLowerCase().includes(query);
    });
  }, [baseFilteredAccounts, searchQuery]);

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
  }) => {
    if (Number.isNaN(formData.balance)) {
      setError("Balance must be a valid number.");
      return;
    }

    // Duplicate check
    const isDuplicate = accounts.some(
      (a) =>
        a.id !== selectedEditingAccount?.id &&
        a.name.toLowerCase() === formData.name.toLowerCase() &&
        !a.isArchived
    );
    if (isDuplicate) {
      setError(`An active account named "${formData.name}" already exists.`);
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
        };

        // Disallow updating balances manually if the account is a Synced Plaid account
        if (!selectedEditingAccount.plaidItemId) {
          payload.startingBalance = formData.balance;
          payload.currentBalance = formData.balance;
        }

        await updateAccount(selectedEditingAccount.id, payload);
      } else {
        await addManualAccount({
          name: formData.name,
          accountType: formData.accountType,
          normalBalance: formData.normalBalance,
          startingBalance: formData.balance,
        });
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

  async function handleArchiveAccount(accountId: string) {
    try {
      setError(null);
      await archiveAccount(accountId);
    } catch (archiveError) {
      console.error(archiveError);
      setError("Could not archive account.");
    }
  }

  async function handleRestoreAccount(account: Account) {
    try {
      setError(null);
      await updateAccount(account.id, {
        name: account.name,
        accountType: account.accountType,
        normalBalance: account.normalBalance,
        startingBalance: account.startingBalance,
        currentBalance: account.currentBalance ?? account.startingBalance,
        isArchived: false,
      });
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

  const rowMenuAccount = accounts.find((a) => a.id === rowMenuAccountId) ?? null;

  return (
    <Stack spacing={2.25}>
      {/* Header */}
      <Stack
        spacing={2}
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}>
            Accounts
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.25} sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<SyncRoundedIcon />}
            onClick={() => window.location.reload()}
            sx={{
              height: 40,
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Refresh Balances
          </Button>

          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            endIcon={<ExpandMoreRoundedIcon />}
            onClick={(event) => setAddMenuAnchor(event.currentTarget)}
            sx={{
              height: 40,
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Add Account
          </Button>

          <Menu
            anchorEl={addMenuAnchor}
            open={addMenuOpen}
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
                  plaidTrigger.onClick();
                }}
                disabled={plaidTrigger.disabled}
                sx={{ borderRadius: 2, py: 1.25, alignItems: "flex-start", gap: 1.5 }}
              >
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: "#eef2ff",
                    color: "#4f46e5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AccountBalanceRoundedIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {plaidTrigger.disabled ? plaidTrigger.label : "Connect a Bank"}
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

          <PlaidLinkButton
            onSyncSuccess={() => window.location.reload()}
            render={() => null}
            onStateChange={setPlaidTrigger}
          />
        </Stack>
      </Stack>

      {error && (
        <Snackbar open autoHideDuration={5000} onClose={() => setError(null)}>
          <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ borderRadius: 2, fontWeight: 600 }}>
            {error}
          </Alert>
        </Snackbar>
      )}

      {/* Overview Cards */}
      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <CardContent sx={{ p: 2.25 }}>
          <Typography variant="body1" sx={{ fontWeight: 700, mb: 1.75 }}>
            Overview
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr 1fr" }, gap: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: "#ecfdf5", color: "#059669", display: "flex", alignItems: "center", justifyValue: "center", justifyContent: "center" }}>
                <TrendingUpRoundedIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Assets</Typography>
                <Typography sx={{ fontWeight: 800, color: "#059669" }}>{formatCurrency(accountSummary.assetTotal)}</Typography>
                <Typography variant="caption" color="text.secondary">{accountSummary.assetCount} accounts</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: "#fef2f2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TrendingDownRoundedIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Liabilities</Typography>
                <Typography sx={{ fontWeight: 800, color: "#dc2626" }}>-{formatCurrency(accountSummary.liabilityTotal)}</Typography>
                <Typography variant="caption" color="text.secondary">{accountSummary.liabilityCount} accounts</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: "#eef2ff", color: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <PieChartRoundedIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Net Worth</Typography>
                <Typography sx={{ fontWeight: 800 }}>{formatCurrency(accountSummary.netWorth)}</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: "#eff6ff", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CreditCardRoundedIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total Accounts</Typography>
                <Typography sx={{ fontWeight: 800 }}>{accountSummary.totalCount}</Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Accounts Table Section */}
      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ px: 2.25, pt: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5, mb: 1 }}>
            <Tabs value={viewFilter} onChange={(_e, v: ViewFilter) => setViewFilter(v)} sx={{ minHeight: 0 }}>
              <Tab
                value="active"
                sx={{ textTransform: "none", fontWeight: 700 }}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box>Active</Box>
                    <Chip size="small" label={accountSummary.activeCount} />
                  </Box>
                }
              />
              <Tab
                value="archived"
                sx={{ textTransform: "none", fontWeight: 700 }}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box>Archived</Box>
                    <Chip size="small" label={accountSummary.archivedCount} />
                  </Box>
                }
              />
            </Tabs>

            <TextField
              size="small"
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ width: 240, "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}
            />
          </Box>
        </Box>

        <CardContent sx={{ p: 0 }}>
          {accountsLoading ? (
            <Box sx={{ p: 2.25 }}><Typography variant="body2" color="text.secondary">Loading...</Typography></Box>
          ) : displayedAccounts.length === 0 ? (
            <Box sx={{ p: 2.25 }}><Typography variant="body2" color="text.secondary">No accounts found.</Typography></Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0 }}>
              <Table sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "#f8fafc" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Balance</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedAccounts.map((account) => {
                    const styleConfig = accountTypeStyles[account.accountType] || { label: account.accountType, color: "#64748b" };
                    const balance = account.currentBalance ?? account.startingBalance ?? 0;

                    return (
                      <TableRow key={account.id} hover>
                        <TableCell sx={{ fontWeight: 600}}>
                          {account.name} <SyncRoundedIcon style={{ fontSize: 14, justifySelf: "center" }} />
                        </TableCell>
                        <TableCell>
                          <Chip label={styleConfig.label} size="small" sx={{ 
                            color: styleConfig.color, 
                            bgcolor: `${styleConfig.color}10`,
                            fontWeight: 600 
                          }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: account.normalBalance === "liability" ? "#dc2626" : "text.primary" }}>
                          {formatCurrency(balance)}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={(e) => handleOpenRowMenu(e, account.id)}>
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
        </CardContent>
      </Card>

      {/* Account Forms Dialog Popup Wrapper */}
      <AccountFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveAccountForm}
        isSaving={isSaving}
        editingAccount={selectedEditingAccount}
      />

      {/* Row context Action options menu popup */}
      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu}>
        {rowMenuAccount && !rowMenuAccount.isArchived && (
          <MenuItem onClick={() => { handleOpenEditForm(rowMenuAccount); handleCloseRowMenu(); }} sx={{ gap: 1 }}>
            <EditRoundedIcon sx={{ fontSize: 16 }} /> Edit
          </MenuItem>
        )}
        {rowMenuAccount && !rowMenuAccount.isArchived ? (
          <MenuItem onClick={() => { handleArchiveAccount(rowMenuAccount.id); handleCloseRowMenu(); }} sx={{ gap: 1, color: "error.main" }}>
            <ArchiveRoundedIcon sx={{ fontSize: 16 }} /> Archive
          </MenuItem>
        ) : (
          rowMenuAccount && (
            <MenuItem onClick={() => { handleRestoreAccount(rowMenuAccount); handleCloseRowMenu(); }} sx={{ gap: 1, color: "success.main" }}>
              <UnarchiveRoundedIcon sx={{ fontSize: 16 }} /> Restore
            </MenuItem>
          )
        )}
      </Menu>
    </Stack>
  );
}