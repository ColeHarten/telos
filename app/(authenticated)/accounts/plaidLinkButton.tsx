"use client";

import usePlaidAccountLink, { type PlaidAccountLink } from "@/lib/hooks/usePlaidAccountLink";
import SyncProblemRoundedIcon from "@mui/icons-material/SyncProblemRounded";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from "@mui/material";

/**
 * Shown when Link finished at a bank that's already connected. Nothing has
 * been used up yet: the public token is only exchanged if the user confirms.
 */
export function LinkConfirmDialog({ link }: { link: PlaidAccountLink }) {
  return (
    <Dialog open={link.confirmation !== null} onClose={link.cancelConfirmation} maxWidth="xs" fullWidth>
      <DialogTitle>Already connected</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "grey.700" }}>
          {link.confirmation?.message}
        </Typography>
        <Typography variant="body2" sx={{ color: "grey.700", mt: 1.5 }}>
          Continuing uses one of your Plaid connections.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={link.cancelConfirmation}>
          Cancel
        </Button>
        <Button
          onClick={link.confirmDifferentLogin}
          variant="contained"
        >
          This is a different login
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type PlaidReconnectButtonProps = {
  itemId: string;
  onLinkError?: (message: string) => void;
};

/** The warning icon on an account row whose bank needs the user to sign in again. */
export function PlaidReconnectButton({ itemId, onLinkError }: PlaidReconnectButtonProps) {
  const link = usePlaidAccountLink({ updateModeItemId: itemId, onLinkError });

  return (
    <Tooltip title={link.label}>
      <span>
        <IconButton size="small" onClick={link.onClick} disabled={link.disabled} sx={{ p: 0.25, color: "error.main" }}>
          <SyncProblemRoundedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}
