"use client";

import type { PlaidAccountLinkTrigger } from "@/lib/hooks/usePlaidAccountLink";
import type { PlaidUsage } from "@/lib/plaidSync";
import type { Account, PlaidConnection } from "@/lib/types/types";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

type ConnectBankDialogProps = {
  open: boolean;
  onClose: () => void;
  connections: PlaidConnection[];
  accounts: Account[];
  usage: PlaidUsage | null;
  link: PlaidAccountLinkTrigger;
};

export function accountLabel(account: Pick<Account, "name" | "plaidMask">): string {
  return account.plaidMask ? `${account.name} ••${account.plaidMask}` : account.name;
}

/**
 * The step before Plaid Link: what's already connected and how many Plaid
 * connections are left, so a bank isn't linked twice by mistake.
 */
export default function ConnectBankDialog({ open, onClose, connections, accounts, usage, link }: ConnectBankDialogProps) {
  const atLimit = usage !== null && usage.env === "production" && usage.used >= usage.limit;

  return (
    <Dialog open={open} onClose={link.disabled ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: "1.05rem" }}>Connect a bank</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: "#334155" }}>
            Each bank login you connect uses one of your Plaid connections, and disconnecting a bank doesn&apos;t give
            its connection back. If the bank is already listed below, use Manage accounts on its card to add accounts,
            or Reconnect if it stopped syncing. Connecting the same login twice can break the first connection.
          </Typography>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              p: 1.75,
              borderRadius: 2.5,
              border: "1px solid #e2e8f0",
              bgcolor: "#f8fafc",
            }}
          >
            <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500 }}>
              Connections used
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {usage?.env === "sandbox" && (
                <Chip label="Sandbox" size="small" sx={{ height: 20, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", bgcolor: "#f1f5f9" }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 700, color: "#0f172a" }}>
                {usage ? `${usage.used} of ${usage.limit}` : "..."}
              </Typography>
            </Stack>
          </Box>

          {atLimit && (
            <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
              Every connection on your Plaid plan is in use, so Plaid will refuse a new bank.
            </Alert>
          )}

          {connections.length > 0 && (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: "#0f172a", mb: 1 }}>
                Already connected
              </Typography>
              <Stack spacing={1}>
                {connections.map((connection) => {
                  const connectionAccounts = accounts.filter((account) => account.plaidItemId === connection.itemId);
                  return (
                    <Stack key={connection.itemId} direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 2,
                          bgcolor: "#eef2ff",
                          color: "#4f46e5",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <AccountBalanceRoundedIcon sx={{ fontSize: 18 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: "#0f172a" }}>
                          {connection.institutionName ?? "Bank connection"}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#64748b", display: "block" }}>
                          {connectionAccounts.length > 0
                            ? connectionAccounts.map(accountLabel).join(", ")
                            : "No accounts yet"}
                        </Typography>
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} disabled={link.disabled} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={link.onClick}
          disabled={link.disabled}
          variant="contained"
          disableElevation
          sx={{ textTransform: "none", fontWeight: 700, bgcolor: "#2563eb", "&:hover": { bgcolor: "#1d4ed8" } }}
        >
          {link.disabled ? link.label : "Continue to Plaid"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
