"use client";

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

export type NewAccountSummary = { id: string; name: string };

interface ContributionEligibilityPromptDialogProps {
  open: boolean;
  accounts: NewAccountSummary[];
  isSaving: boolean;
  onConfirm: (selections: Record<string, boolean>) => Promise<void>;
  onSkip: () => void;
}

/**
 * Shown right after one or more new accounts are created — manually or via
 * Plaid — so the user decides, per account, whether it should be selectable
 * as a destination for a paycheck deduction's linked transfer (see
 * Account.isContributionEligible). Every new account defaults to *not*
 * eligible; this dialog is the only place that flips it to true at creation
 * time (editing an existing account still uses the inline switch in
 * AccountFormDialog).
 */
export default function ContributionEligibilityPromptDialog({
  open,
  accounts,
  isSaving,
  onConfirm,
  onSkip,
}: ContributionEligibilityPromptDialogProps) {
  const [selections, setSelections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setSelections(Object.fromEntries(accounts.map((a) => [a.id, false])));
    }
  }, [open, accounts]);

  if (accounts.length === 0) return null;

  return (
    <Dialog open={open} onClose={onSkip} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
        Eligible for paycheck contributions?
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {accounts.length === 1
            ? "Let this account be selected as a destination for a deduction in a Paycheck Profile."
            : "Choose which of these new accounts can be selected as a destination for a deduction in a Paycheck Profile."}
        </Typography>

        <Stack spacing={0}>
          {accounts.map((account, i) => (
            <Box
              key={account.id}
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                py: 1,
                borderTop: i === 0 ? "none" : "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {account.name}
              </Typography>
              <Switch
                checked={Boolean(selections[account.id])}
                onChange={(e) =>
                  setSelections((prev) => ({ ...prev, [account.id]: e.target.checked }))
                }
                disabled={isSaving}
              />
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onSkip} disabled={isSaving} sx={{ textTransform: "none", fontWeight: 700 }}>
          Skip
        </Button>
        <Button
          onClick={() => onConfirm(selections)}
          variant="contained"
          disabled={isSaving}
          sx={{ height: 36, borderRadius: 2, textTransform: "none", fontWeight: 700, px: 3 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}