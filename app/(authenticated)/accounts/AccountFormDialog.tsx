"use client";

import type { Account, AccountType, NormalBalance } from "@/lib/types/types";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

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

interface AccountFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    accountType: AccountType;
    normalBalance: NormalBalance;
    balance: number;
    isContributionEligible: boolean;
  }) => Promise<void>;
  isSaving: boolean;
  editingAccount: Account | null;
}

export default function AccountFormDialog({
  open,
  onClose,
  onSave,
  isSaving,
  editingAccount,
}: AccountFormDialogProps) {
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("cash");
  const [balance, setBalance] = useState("");
  const [isContributionEligible, setIsContributionEligible] = useState(false);

  const isEditing = editingAccount !== null;
  const isSyncedAccount = editingAccount?.plaidItemId != null;

  // Sync internal state when the modal opens or updates
  useEffect(() => {
    if (open) {
      if (editingAccount) {
        setName(editingAccount.name);
        setAccountType(editingAccount.accountType);
        setBalance(String(editingAccount.currentBalance ?? editingAccount.startingBalance ?? 0));
        setIsContributionEligible(Boolean(editingAccount.isContributionEligible));
      } else {
        setName("");
        setAccountType("cash");
        setBalance("");
        setIsContributionEligible(false);
      }
    }
  }, [open, editingAccount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalBalance = getNormalBalance(accountType);
    const parsedBalance = Number(balance || 0);

    await onSave({
      name: name.trim(),
      accountType,
      normalBalance,
      balance: parsedBalance,
      isContributionEligible,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason !== "backdropClick" && !isSaving) onClose();
      }}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          component: "form",
          onSubmit: handleSubmit,
          sx: { borderRadius: 3 },
        },
      }}
    >
      <DialogTitle sx={{ pt: 2.5 }}>
        {isEditing ? "Edit account" : "Add account"}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            size="small"
            label="Account name"
            placeholder="e.g., Chase Checking"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            required
            sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}
          />

          <FormControl fullWidth size="small" sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}>
            <InputLabel id="account-type-label">Account type</InputLabel>
            <Select
              labelId="account-type-label"
              label="Account type"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
              disabled={isSaving}
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="credit_card">Credit card</MenuItem>
              <MenuItem value="investment">Investment</MenuItem>
              <MenuItem value="retirement">Retirement</MenuItem>
              <MenuItem value="loan">Loan</MenuItem>
              <MenuItem value="property">Property</MenuItem>
              <MenuItem value="crypto">Crypto</MenuItem>
              <MenuItem value="other_asset">Other asset</MenuItem>
              <MenuItem value="other_liability">Other liability</MenuItem>
            </Select>
          </FormControl>

          {!isSyncedAccount && (
            <TextField
              fullWidth
              size="small"
              label={isEditing ? "Current balance" : "Starting balance"}
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              disabled={isSaving}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                },
              }}
              sx={{
                "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 },
                "& input": { textAlign: "right" },
              }}
            />
          )}

          {isEditing && (
            <FormControlLabel
              control={
                <Switch
                  checked={isContributionEligible}
                  onChange={(e) => setIsContributionEligible(e.target.checked)}
                  disabled={isSaving}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Eligible for paycheck contributions
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Lets this account be selected as a destination for a deduction in a Paycheck Profile.
                  </Typography>
                </Box>
              }
              sx={{ ml: 0, alignItems: "flex-start" }}
            />
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isSaving}
          sx={{ height: 36, px: 3 }}
        >
          {isEditing ? "Save changes" : "Add account"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}