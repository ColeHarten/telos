"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

interface AutomationPromptDialogProps {
  open: boolean;
  merchantLabel: string;
  cashflowLabel: string;
  onConfirm: () => void | Promise<void>;
  onDismiss: () => void;
}

/**
 * Shown right after a user manually assigns a transaction to a cashflow.
 * Offers to turn that one-off assignment into a standing automation so
 * future transactions from the same merchant are categorized the same way
 * automatically (see useAutomations.createAutomation).
 */
export default function AutomationPromptDialog({
  open,
  merchantLabel,
  cashflowLabel,
  onConfirm,
  onDismiss,
}: AutomationPromptDialogProps) {
  return (
    <Dialog open={open} onClose={onDismiss} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
        Categorize future transactions?
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: "0.9rem" }}>
          Assign every future transaction from <strong>{merchantLabel}</strong> to{" "}
          <strong>{cashflowLabel}</strong> automatically?
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ paddingLeft: "24px", paddingRight: "24px", paddingBottom: "16px" }}>
        <Button onClick={onDismiss} sx={{ textTransform: "none", fontWeight: 600 }}>
          Not now
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          disableElevation
          sx={{
            textTransform: "none",
            fontWeight: 600,
            backgroundColor: "#6366f1",
            "&:hover": { backgroundColor: "#4f46e5" },
          }}
        >
          Always categorize this way
        </Button>
      </DialogActions>
    </Dialog>
  );
}