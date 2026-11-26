"use client";

import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

interface IsolationWarningDialogProps {
  open: boolean;
  // e.g. "account" / "category" — used to build the generic copy below.
  entityLabel: string;
  entityName: string;
  // Non-blocking reasons from checkAccountIsolation / checkCategoryIsolation.
  // Archiving is always allowed to proceed — this is a confirmation, not a
  // hard stop (unlike the equivalent check before permanent deletion).
  reasons: string[];
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Shared confirmation dialog shown before archiving an account or category
 * that checkAccountIsolation / checkCategoryIsolation found still has live
 * references elsewhere (transaction history, rules, linked
 * deductions, dependent transfer categories, etc).
 *
 * Unlike DeleteAccountDialog, this never blocks the action — every reason
 * here is informational ("here's what's still connected to this"), since
 * archiving is reversible (see restoreCategory / the account "Restore"
 * action) in a way permanent deletion isn't. If `reasons` is empty, the
 * caller should skip opening this dialog entirely and archive directly.
 */
export default function IsolationWarningDialog({
  open,
  entityLabel,
  entityName,
  reasons,
  isProcessing = false,
  onCancel,
  onConfirm,
}: IsolationWarningDialogProps) {
  return (
    <Dialog open={open} onClose={isProcessing ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: "1.05rem", display: "flex", alignItems: "center", gap: 1 }}>
        <WarningAmberRoundedIcon sx={{ color: "#d97706" }} />
        Archive this {entityLabel}?
      </DialogTitle>

      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant="body2" sx={{ color: "#334155" }}>
            <strong>{entityName}</strong> still has things connected to it:
          </Typography>

          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            <Box component="ul" sx={{ pl: 2.25, m: 0, "& li + li": { mt: 0.5 } }}>
              {reasons.map((reason) => (
                <Typography component="li" variant="body2" key={reason}>
                  {reason}
                </Typography>
              ))}
            </Box>
          </Alert>

          <Typography variant="body2" color="text.secondary">
            You can restore this {entityLabel} later if you change your mind. Archive it anyway?
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onCancel} disabled={isProcessing} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="warning"
          variant="contained"
          disabled={isProcessing}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {isProcessing ? "Archiving..." : "Archive Anyway"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}