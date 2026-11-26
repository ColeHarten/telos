"use client";

import {
  consentDaysLeft,
  formatSyncAge,
  isConsentExpiringSoon,
  isFailing,
  isImporting,
} from "@/lib/connections";
import usePlaidAccountLink from "@/lib/hooks/usePlaidAccountLink";
import { rebuildFromPlaid, refreshFromBank, type PlaidUsage } from "@/lib/plaidSync";
import type { Account, PlaidConnection } from "@/lib/types/types";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { accountLabel } from "./ConnectBankDialog";

type ConnectionsPanelProps = {
  connections: PlaidConnection[];
  accounts: Account[];
  usage: PlaidUsage | null;
  onDisconnect: (itemId: string) => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  /** Accounts that Manage accounts just added, for the contribution prompt. */
  onNewAccounts: (accounts: { id: string; name: string }[]) => void;
};

type CardProps = Omit<ConnectionsPanelProps, "connections"> & { connection: PlaidConnection };

type Status = { label: string; color: string; bg: string };

const CONFIRM_WORD = "DISCONNECT";

const buttonSx = {
  fontWeight: 600,
  fontSize: "0.8rem",
  borderRadius: 2,
  px: 1.5,
  py: 0.5,
  whiteSpace: "nowrap",
} as const;

const outlinedButtonSx = {
  ...buttonSx,
  borderColor: "#bfdbfe",
  color: "primary.main",
  bgcolor: "background.paper",
  "&:hover": { borderColor: "#93c5fd", bgcolor: "#eff6ff" },
} as const;

const smallChipSx = { height: 20, fontSize: "0.68rem", fontWeight: 600, borderRadius: 1.5 } as const;

// Re-renders every minute so "Synced 5m ago" and the status stay current.
function useMinuteTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
}

function statusOf(connection: PlaidConnection, otherEnv: boolean): Status {
  if (otherEnv) return { label: "Other environment", color: "text.secondary", bg: "#f1f5f9" };
  if (connection.needsReauth) return { label: "Needs reconnect", color: "error.main", bg: "#fef2f2" };
  if (isFailing(connection)) return { label: "Sync failed", color: "error.main", bg: "#fef2f2" };
  if (isImporting(connection)) return { label: "Importing history…", color: "primary.main", bg: "#eff6ff" };
  if (isConsentExpiringSoon(connection)) return { label: "Access expiring", color: "#b45309", bg: "#fffbeb" };
  return { label: "Up to date", color: "success.main", bg: "#f0fdf4" };
}

function statusMessage(connection: PlaidConnection, otherEnv: boolean, currentEnv: string | null): { text: string; color: string } | null {
  if (otherEnv) {
    return {
      text: `Linked in Plaid ${connection.plaidEnv}. This server uses ${currentEnv ?? "another environment"}, so it leaves this bank alone.`,
      color: "text.secondary",
    };
  }
  if (connection.needsReauth) {
    return { text: "The bank needs you to sign in again. Reconnect keeps its history and doesn't use a new connection.", color: "error.main" };
  }
  if (isFailing(connection)) {
    return { text: `The last sync failed (${connection.lastSyncError}). Telos retries on its own; Refresh tries now.`, color: "error.main" };
  }
  if (isImporting(connection)) {
    return { text: "Plaid is still sending this bank's history. It usually takes a few minutes, and up to a few hours at some banks.", color: "primary.main" };
  }
  if (isConsentExpiringSoon(connection)) {
    const days = consentDaysLeft(connection) ?? 0;
    return {
      text:
        days <= 0
          ? "Your consent for this bank has run out. Reconnect to renew it."
          : `Your consent for this bank runs out in ${days} day${days === 1 ? "" : "s"}. Reconnect to renew it.`,
      color: "#b45309",
    };
  }
  return null;
}

function ConnectionCard({ connection, accounts, usage, onDisconnect, onError, onNotice, onNewAccounts }: CardProps) {
  const name = connection.institutionName ?? "Bank connection";
  const currentEnv = usage?.env ?? null;
  const otherEnv = currentEnv !== null && connection.plaidEnv !== currentEnv;
  const status = statusOf(connection, otherEnv);
  const message = statusMessage(connection, otherEnv, currentEnv);
  const showReconnect = connection.needsReauth || isConsentExpiringSoon(connection);
  const connectionAccounts = accounts.filter((account) => account.plaidItemId === connection.itemId);

  const [busy, setBusy] = useState<"refresh" | "rebuild" | "disconnect" | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const manage = usePlaidAccountLink({
    updateModeItemId: connection.itemId,
    accountSelection: true,
    onUpdateComplete: (summary) => {
      if (summary.newAccounts.length > 0) {
        onNewAccounts(summary.newAccounts.map((account) => ({ id: account.id, name: account.name })));
      } else {
        onNotice(`${name} is updated.`);
      }
    },
    onLinkError: onError,
  });

  const reconnect = usePlaidAccountLink({
    updateModeItemId: connection.itemId,
    onUpdateComplete: () => onNotice(`${name} is reconnected.`),
    onLinkError: onError,
  });

  async function handleRefresh() {
    setBusy("refresh");
    try {
      const result = await refreshFromBank(connection.itemId);
      if (result.itemsNeedingReauth.length > 0) onError(`${name} needs you to sign in again. Use Reconnect.`);
      else if (result.itemsFailed.length > 0) onError(`${name} couldn't be refreshed right now. Try again later.`);
      else onNotice(`Asked ${name} for new transactions. They usually arrive within a few minutes.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not refresh this bank.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRebuild() {
    setRebuildOpen(false);
    setBusy("rebuild");
    try {
      await rebuildFromPlaid(connection.itemId);
      onNotice(`Rebuilding ${name}. Its history re-imports over the next few minutes.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not start the rebuild.");
    } finally {
      setBusy(null);
    }
  }

  function closeDisconnect() {
    setDisconnectOpen(false);
    setConfirmText("");
  }

  async function handleDisconnect() {
    setBusy("disconnect");
    try {
      await onDisconnect(connection.itemId);
      onNotice(`${name} is disconnected. Its accounts are now manual accounts.`);
      closeDisconnect();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not disconnect the bank.");
    } finally {
      setBusy(null);
    }
  }

  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Avatar sx={{ bgcolor: "#eef2ff", color: "#4f46e5", width: 40, height: 40 }}>
          <AccountBalanceRoundedIcon sx={{ fontSize: 20 }} />
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography sx={{ fontWeight: 700, color: "text.primary", fontSize: "0.95rem" }}>{name}</Typography>
            <Chip label={status.label} size="small" sx={{ ...smallChipSx, height: 22, color: status.color, bgcolor: status.bg }} />
          </Stack>
          <Typography variant="caption" sx={{ color: "grey.400", display: "block", mt: 0.25, fontSize: "0.75rem" }}>
            Synced {formatSyncAge(connection.lastSyncedAt)}
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label={`More actions for ${name}`}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          disabled={otherEnv || busy !== null}
          sx={{ color: "grey.400" }}
        >
          <MoreHorizRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>

      {message && (
        <Typography variant="body2" sx={{ color: message.color, mt: 1.5, fontSize: "0.8rem" }}>
          {message.text}
        </Typography>
      )}

      <Stack spacing={0.5} sx={{ mt: 1.5 }}>
        {connectionAccounts.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
            No accounts are syncing from this bank. Use Manage accounts to share some.
          </Typography>
        ) : (
          connectionAccounts.map((account) => (
            <Stack key={account.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2" sx={{ color: "grey.700", fontSize: "0.8rem" }}>
                {accountLabel(account)}
              </Typography>
              {account.plaidClosed && <Chip label="Not shared" size="small" sx={{ ...smallChipSx, color: "#b45309", bgcolor: "#fffbeb" }} />}
              {account.isArchived && <Chip label="Archived" size="small" sx={{ ...smallChipSx, color: "text.secondary", bgcolor: "grey.100" }} />}
            </Stack>
          ))
        )}
      </Stack>

      {!otherEnv && (
        <Stack direction="row" spacing={1} sx={{ mt: "auto", pt: 2, flexWrap: "wrap", rowGap: 1 }}>
          {showReconnect && (
            <Button
              variant="contained"
              onClick={reconnect.onClick}
              disabled={reconnect.disabled}
              sx={{ ...buttonSx, bgcolor: "error.main", "&:hover": { bgcolor: "#b91c1c" } }}
            >
              {reconnect.disabled ? reconnect.label : "Reconnect"}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<SyncRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={handleRefresh}
            disabled={busy !== null || connection.needsReauth}
            sx={outlinedButtonSx}
          >
            {busy === "refresh" ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outlined" onClick={manage.onClick} disabled={manage.disabled || busy !== null} sx={outlinedButtonSx}>
            {manage.disabled ? manage.label : "Manage accounts"}
          </Button>
        </Stack>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setRebuildOpen(true);
          }}
          disabled={connection.needsReauth}
          sx={{ gap: 1 }}
        >
          <RestartAltRoundedIcon sx={{ fontSize: 16 }} /> Rebuild from Plaid
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setDisconnectOpen(true);
          }}
          sx={{ gap: 1, color: "error.main" }}
        >
          <LinkOffRoundedIcon sx={{ fontSize: 16 }} /> Disconnect
        </MenuItem>
      </Menu>

      <Dialog open={rebuildOpen} onClose={() => setRebuildOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Rebuild {name} from Plaid?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "grey.700" }}>
            Telos imports this bank&apos;s full history from Plaid again and removes transactions Plaid no longer has.
            Your categories are kept, the bank stays connected, and no new connection is used.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRebuildOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRebuild}
            variant="contained"
          >
            Rebuild
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={disconnectOpen} onClose={busy === "disconnect" ? undefined : closeDisconnect} maxWidth="xs" fullWidth>
        <DialogTitle>Disconnect {name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "grey.700" }}>
            {connectionAccounts.length === 1
              ? "Its account becomes a manual account"
              : `Its ${connectionAccounts.length} accounts become manual accounts`}{" "}
            that keep their history, and balances stop updating.
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Plaid doesn&apos;t give the connection back: linking {name} again uses another one
            {usage ? ` (${usage.used} of ${usage.limit} used)` : ""}. If the bank stopped syncing, use Reconnect instead.
          </Alert>
          <TextField
            label={`Type ${CONFIRM_WORD} to confirm`}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            fullWidth
            size="small"
            autoComplete="off"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDisconnect} disabled={busy === "disconnect"}>
            Cancel
          </Button>
          <Button
            onClick={handleDisconnect}
            color="error"
            variant="contained"
            disabled={!confirmed || busy === "disconnect"}
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

/** One card per bank connection: status, accounts, and what can be done with it. */
export default function ConnectionsPanel({ connections, ...rest }: ConnectionsPanelProps) {
  useMinuteTick();
  if (connections.length === 0) return null;

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.5, gap: 2, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 700, color: "text.primary", fontSize: "0.95rem" }}>Bank connections</Typography>
        {rest.usage && (
          <Typography variant="caption" sx={{ color: "grey.400", fontSize: "0.75rem" }}>
            {rest.usage.used} of {rest.usage.limit} Plaid connections used{rest.usage.env === "sandbox" ? " (sandbox)" : ""}
          </Typography>
        )}
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        {connections.map((connection) => (
          <ConnectionCard key={connection.itemId} connection={connection} {...rest} />
        ))}
      </Box>
    </Box>
  );
}
