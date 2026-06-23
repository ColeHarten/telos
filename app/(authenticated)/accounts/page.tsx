"use client";


import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import AddBusinessRoundedIcon from "@mui/icons-material/AddBusinessRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import CurrencyBitcoinRoundedIcon from "@mui/icons-material/CurrencyBitcoinRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    FormControl,
    Grid,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import useBudgetingData from "@/lib/useBudgetingData";
import useAuth from "@/lib/hooks/useAuth";
import useAccounts from "@/lib/hooks/useAccounts";
import type { AccountType, NormalBalance, Account } from "@/lib/types/types";
import { formatCurrency } from "@/lib/utils";

const accountTypeStyles: Record<
  AccountType,
  {
    label: string;
    color: string;
    background: string;
    icon: typeof AccountBalanceRoundedIcon;
  }
> = {
  cash: {
    label: "Cash",
    color: "#059669",
    background: "#ecfdf5",
    icon: AccountBalanceRoundedIcon,
  },
  credit_card: {
    label: "Credit Card",
    color: "#dc2626",
    background: "#fef2f2",
    icon: CreditCardRoundedIcon,
  },
  investment: {
    label: "Investment",
    color: "#2563eb",
    background: "#eff6ff",
    icon: ShowChartRoundedIcon,
  },
  retirement: {
    label: "Retirement",
    color: "#7c3aed",
    background: "#f5f3ff",
    icon: SavingsRoundedIcon,
  },
  loan: {
    label: "Loan",
    color: "#ea580c",
    background: "#fff7ed",
    icon: SchoolRoundedIcon,
  },
  property: {
    label: "Property",
    color: "#0891b2",
    background: "#ecfeff",
    icon: HomeRoundedIcon,
  },
  crypto: {
    label: "Crypto",
    color: "#ca8a04",
    background: "#fefce8",
    icon: CurrencyBitcoinRoundedIcon,
  },
  other_asset: {
    label: "Other Asset",
    color: "#475569",
    background: "#f8fafc",
    icon: AddBusinessRoundedIcon,
  },
  other_liability: {
    label: "Other Liability",
    color: "#be123c",
    background: "#fff1f2",
    icon: AccountBalanceWalletRoundedIcon,
  },
};

function getNormalBalance(accountType: AccountType): NormalBalance {
  if (
    accountType === "credit_card" ||
    accountType === "loan" ||
    accountType === "other_liability"
  ) {
    return "liability";
  }

  return "asset";
}

export default function AccountsPage() {
  const { user, authLoading } = useAuth();
  const { accounts, accountsLoading, addAccount, updateAccount, archiveAccount } = useAccounts(user, authLoading);
  const isLoading = accountsLoading;
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("cash");
  const [newStartingBalance, setNewStartingBalance] = useState("");

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const isEditingAccount = editingAccountId !== null;

  useEffect(() => {
    // clear page-level errors when user/account list changes
    setError(null);
  }, [user, accounts]);

  const activeAccounts = useMemo(() => accounts.filter((account) => !account.isArchived), [accounts]);

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
      assetCount: activeAccounts.filter(
        (account) => account.normalBalance === "asset"
      ).length,
      liabilityCount: activeAccounts.filter(
        (account) => account.normalBalance === "liability"
      ).length,
      assetTotal,
      liabilityTotal,
      netWorth: assetTotal - liabilityTotal,
    };
  }, [activeAccounts]);

  async function handleAddAccount() {
    const trimmedName = newAccountName.trim();

    if (!trimmedName) {
      setError("Account name is required.");
      return;
    }

    const parsedStartingBalance = Number(newStartingBalance || 0);

    if (Number.isNaN(parsedStartingBalance)) {
      setError("Starting balance must be a valid number.");
      return;
    }

    try {
      setError(null);
      setIsSaving(true);

      const normalBalance = getNormalBalance(newAccountType);

      await addAccount({
        name: trimmedName,
        accountType: newAccountType,
        normalBalance,
        startingBalance: parsedStartingBalance,
      });

      setNewAccountName("");
      setNewAccountType("cash");
      setNewStartingBalance("");
    } catch (saveError) {
      console.error(saveError);
      setError("Could not add account.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleStartEditAccount(account: Account) {
    setError(null);
    setEditingAccountId(account.id);
    setNewAccountName(account.name);
    setNewAccountType(account.accountType);
    setNewStartingBalance(String(account.currentBalance ?? account.startingBalance));
    }

    function handleCancelEditAccount() {
    setError(null);
    setEditingAccountId(null);
    setNewAccountName("");
    setNewAccountType("cash");
    setNewStartingBalance("");
    }

    async function handleSaveEditedAccount() {
    if (!user || !editingAccountId) {
      return;
    }

    const trimmedName = newAccountName.trim();

    if (!trimmedName) {
        setError("Account name is required.");
        return;
    }

    const parsedBalance = Number(newStartingBalance || 0);

    if (Number.isNaN(parsedBalance)) {
        setError("Balance must be a valid number.");
        return;
    }

    try {
        setError(null);
      setIsSaving(true);

      const normalBalance = getNormalBalance(newAccountType);

      try {
        await updateAccount(editingAccountId, {
          name: trimmedName,
          accountType: newAccountType,
          normalBalance,
          startingBalance: parsedBalance,
          currentBalance: parsedBalance,
        });

        setEditingAccountId(null);
        setNewAccountName("");
        setNewAccountType("cash");
        setNewStartingBalance("");
      } catch (saveError) {
        console.error(saveError);
        setError("Could not update account.");
      } finally {
        setIsSaving(false);
      }
    } catch (saveError) {
    } 
    }

  async function handleArchiveAccount(accountId: string) {
    try {
      setError(null);
      await archiveAccount(accountId);
    } catch (archiveError) {
      console.error(archiveError);
      setError("Could not archive account.");
    }
  }

  async function handleSubmitAccount() {
    if (isEditingAccount) {
        await handleSaveEditedAccount();
        return;
    }

    await handleAddAccount();
 }

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
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Accounts
          </Typography>
        </Box>
      </Stack>

      {error && <Snackbar
        open={error !== null}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
        <Alert
            severity="error"
            variant="filled"
            onClose={() => setError(null)}
            sx={{
            borderRadius: 2,
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
            fontWeight: 600,
            }}
        >
            {error}
        </Alert>
    </Snackbar>}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 2.25 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                Assets
              </Typography>

              <Typography
                variant="h5"
                sx={{
                  mt: 0.25,
                  color: "#059669",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                }}
              >
                {formatCurrency(accountSummary.assetTotal)}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {accountSummary.assetCount} active accounts
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 2.25 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                Liabilities
              </Typography>

              <Typography
                variant="h5"
                sx={{
                  mt: 0.25,
                  color: "#dc2626",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                }}
              >
                {formatCurrency(accountSummary.liabilityTotal)}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {accountSummary.liabilityCount} active accounts
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 2.25 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                Net Position
              </Typography>

              <Typography
                variant="h5"
                sx={{
                  mt: 0.25,
                  color: accountSummary.netWorth >= 0 ? "#059669" : "#dc2626",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                }}
              >
                {formatCurrency(accountSummary.netWorth)}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                Assets minus liabilities
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "background.paper",
        }}
      >
        <CardContent sx={{ p: 2.25 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 700,
              mb: 1.75,
            }}
          >
            {isEditingAccount ? "Edit Account" : "Add New Account"}
          </Typography>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Account name"
                placeholder="e.g., Chase Checking"
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 40,
                    borderRadius: 2,
                  },
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl
                fullWidth
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 40,
                    borderRadius: 2,
                  },
                }}
              >
                <InputLabel>Account type</InputLabel>
                <Select
                  label="Account type"
                  value={newAccountType}
                  onChange={(event) =>
                    setNewAccountType(event.target.value as AccountType)
                  }
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="credit_card">Credit Card</MenuItem>
                  <MenuItem value="investment">Investment</MenuItem>
                  <MenuItem value="retirement">Retirement</MenuItem>
                  <MenuItem value="loan">Loan</MenuItem>
                  <MenuItem value="property">Property</MenuItem>
                  <MenuItem value="crypto">Crypto</MenuItem>
                  <MenuItem value="other_asset">Other Asset</MenuItem>
                  <MenuItem value="other_liability">Other Liability</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                label={isEditingAccount ? "Current balance" : "Starting balance"}
                type="number"
                value={newStartingBalance}
                onChange={(event) => setNewStartingBalance(event.target.value)}
                slotProps={{
                    input: {
                        startAdornment: (
                            <InputAdornment position="start">$</InputAdornment>
                        ),
                    }
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 40,
                    borderRadius: 2,
                  },
                  "& input": {
                    textAlign: "right",
                  },
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 2 }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: "row",
                        alignItems: "center",
                        gap: '10px',
                    }}
                >
                    <Button
                    fullWidth
                    variant="contained"
                    onClick={handleSubmitAccount}
                    disabled={isSaving}
                    sx={{
                        height: 40,
                        borderRadius: 2,
                        textTransform: "none",
                        fontWeight: 700,
                    }}
                    >
                    {isEditingAccount ? "Save" : "Add"}
                    </Button>

                    {isEditingAccount && (
                    <Button
                        variant="outlined"
                        onClick={handleCancelEditAccount}
                        disabled={isSaving}
                        sx={{
                        height: 40,
                        minWidth: 84,
                        borderRadius: 2,
                        textTransform: "none",
                        fontWeight: 700,
                        }}
                    >
                        Cancel
                    </Button>
                    )}
                </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            px: 2.25,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: 700 }}>
            Your Accounts
          </Typography>
        </Box>

        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: { xs: "none", md: "grid" },
              gridTemplateColumns: "1fr 160px 140px 120px 96px",
              px: 2.25,
              py: 1,
              bgcolor: "#f8fafc",
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            {["Account", "Type", "Balance", "Status", "Actions"].map(
              (heading) => (
                <Typography
                  key={heading}
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 700,
                    textAlign: heading === "Actions" ? "right" : "left",
                  }}
                >
                  {heading}
                </Typography>
              )
            )}
          </Box>

          {isLoading ? (
            <Box sx={{ p: 2.25 }}>
              <Typography variant="body2" color="text.secondary">
                Loading accounts...
              </Typography>
            </Box>
          ) : activeAccounts.length === 0 ? (
            <Box sx={{ p: 2.25 }}>
              <Typography variant="body2" color="text.secondary">
                No accounts yet. Add your first account above.
              </Typography>
            </Box>
          ) : (
            activeAccounts.map((account, index) => {
              const style = accountTypeStyles[account.accountType];
              const Icon = style.icon;
              const balance = account.currentBalance ?? account.startingBalance ?? 0;

              return (
                <Box key={account.id}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "1fr 160px 140px 120px 96px",
                      },
                      gap: { xs: 1, md: 0 },
                      alignItems: "center",
                      px: 2.25,
                      py: { xs: 1.5, md: 1 },
                      minHeight: { md: 48 },
                    }}
                  >
                    <Box 
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: '10px'
                      }}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 2,
                          bgcolor: style.background,
                          color: style.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 18 }} />
                      </Box>

                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {account.name}
                      </Typography>
                    </Box>

                    <Box>
                      <Chip
                        label={style.label}
                        size="small"
                        sx={{
                          height: 22,
                          color: style.color,
                          bgcolor: style.background,
                          fontWeight: 700,
                          borderRadius: 1.25,
                          "& .MuiChip-label": {
                            px: 1,
                            fontSize: 12,
                          },
                        }}
                      />
                    </Box>

                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatCurrency(balance)}
                    </Typography>

                    <Box>
                      <Chip
                        label="Active"
                        size="small"
                        sx={{
                          height: 22,
                          color: "#059669",
                          bgcolor: "#ecfdf5",
                          fontWeight: 700,
                          borderRadius: 1.25,
                          "& .MuiChip-label": {
                            px: 1,
                            fontSize: 12,
                          },
                        }}
                      />
                    </Box>

                    <Stack
                      spacing={0.5}
                      sx={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: { xs: "flex-start", md: "flex-end" },
                      }}
                    >
                      <IconButton
                        size="small"
                        aria-label={`Edit ${account.name}`}
                        onClick={() =>{ 
                            if(isEditingAccount) {
                                handleCancelEditAccount();
                            } else {
                                handleStartEditAccount(account)
                            }
                        }}
                        sx={{
                            color: "text.secondary",
                        }}
                        >
                        <EditRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>

                      <IconButton
                        size="small"
                        aria-label={`Archive ${account.name}`}
                        onClick={() => handleArchiveAccount(account.id)}
                        sx={{
                          color: "#dc2626",
                        }}
                      >
                        <ArchiveRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Stack>
                  </Box>

                  {index < activeAccounts.length - 1 && <Divider />}
                </Box>
              );
            })
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}