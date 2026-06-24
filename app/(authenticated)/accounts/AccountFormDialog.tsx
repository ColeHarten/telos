"use client";

import type { Account, AccountType, NormalBalance } from "@/lib/types/types";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
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

  const isEditing = editingAccount !== null;
  const isSyncedAccount = editingAccount?.plaidItemId != null;

  // Sync internal state when the modal opens or updates
  useEffect(() => {
    if (open) {
      if (editingAccount) {
        setName(editingAccount.name);
        setAccountType(editingAccount.accountType);
        setBalance(String(editingAccount.currentBalance ?? editingAccount.startingBalance ?? 0));
      } else {
        setName("");
        setAccountType("cash");
        setBalance("");
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
      <DialogTitle sx={{ fontWeight: 700, pt: 2.5 }}>
        {isEditing ? "Edit Account" : "Add New Account"}
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
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
        <Button onClick={onClose} disabled={isSaving} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isSaving}
          sx={{ height: 36, borderRadius: 2, textTransform: "none", fontWeight: 700, px: 3 }}
        >
          {isEditing ? "Save Changes" : "Add Account"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}