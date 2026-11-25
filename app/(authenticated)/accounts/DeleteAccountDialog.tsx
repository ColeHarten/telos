"use client";

import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

export type IsolationCheck = {
  isIsolated: boolean;
  reasons: string[];
  hasActivePlaidConnection: boolean;
  hasTransactionHistory?: boolean;
};

interface DeleteAccountDialogProps {
  open: boolean;
  accountId: string | null;
  accountName: string;
  onClose: () => void;
  onCheckIsolation: (accountId: string) => Promise<IsolationCheck>;
  onConfirmDelete: (accountId: string) => Promise<void>;
}

/**
 * Confirms permanent deletion of an already-archived account. Re-checks
 * isolation itself (rather than trusting a stale prop) every time it opens,
 * and requires the user to type the account's exact name before "Delete
 * Forever" becomes clickable — this is irreversible, so a single click
 * should never be enough.
 */
export default function DeleteAccountDialog({
  open,
  accountId,
  accountName,
  onClose,
  onCheckIsolation,
  onConfirmDelete,
}: DeleteAccountDialogProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [checkResult, setCheckResult] = useState<IsolationCheck | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !accountId) return;

    let cancelled = false;
    setIsChecking(true);
    setCheckResult(null);
    setConfirmText("");
    setError(null);

    onCheckIsolation(accountId)
      .then((result) => {
        if (!cancelled) setCheckResult(result);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError("Could not verify this account is safe to delete.");
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, accountId, onCheckIsolation]);

  const canDelete = Boolean(checkResult?.isIsolated) && confirmText.trim() === accountName.trim();

  async function handleDelete() {
    if (!accountId || !canDelete) return;
    try {
      setIsDeleting(true);
      setError(null);
      await onConfirmDelete(accountId);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not delete this account.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onClose={isDeleting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: "1.05rem", display: "flex", alignItems: "center", gap: 1 }}>
        <WarningAmberRoundedIcon sx={{ color: "#dc2626" }} />
        Delete account permanently?
      </DialogTitle>

      <DialogContent>
        {isChecking ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : checkResult && !checkResult.isIsolated ? (
          <Stack spacing={1.5}>
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              This account can&apos;t be deleted yet — it&apos;s still connected to other data:
            </Alert>
            <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
              {checkResult.reasons.map((reason) => (
                <Typography component="li" variant="body2" key={reason} sx={{ color: "#334155" }}>
                  {reason}
                </Typography>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary">
              Remove or reassign these links first, then try again.
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: "#334155" }}>
              This permanently deletes <strong>{accountName}</strong>. This cannot be undone — all of its
              history will be gone for good.
            </Typography>
            {checkResult?.hasActivePlaidConnection && (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    This account is still connected to your bank. Deleting it stops syncing it, and disconnects
                    the bank if no other account uses it.
                </Alert>
            )}
            <Typography variant="body2" color="text.secondary">
              Type <strong>{accountName}</strong> to confirm.
            </Typography>
            <TextField
              size="small"
              fullWidth
              autoFocus
              placeholder={accountName}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isDeleting}
            />
          </Stack>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} disabled={isDeleting} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        {checkResult?.isIsolated && (
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={!canDelete || isDeleting}
            sx={{ textTransform: "none", fontWeight: 700 }}
          >
            {isDeleting ? "Deleting..." : "Delete Forever"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}