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
      <DialogTitle sx={{ fontWeight: 700, fontSize: "1.05rem" }}>Already connected</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "#334155" }}>
          {link.confirmation?.message}
        </Typography>
        <Typography variant="body2" sx={{ color: "#334155", mt: 1.5 }}>
          Continuing uses one of your Plaid connections.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={link.cancelConfirmation} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={link.confirmDifferentLogin}
          variant="contained"
          disableElevation
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: "#2563eb", "&:hover": { bgcolor: "#1d4ed8" } }}
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
        <IconButton size="small" onClick={link.onClick} disabled={link.disabled} sx={{ p: 0.25, color: "#dc2626" }}>
          <SyncProblemRoundedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}
