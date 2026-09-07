"use client";

import usePlaidAccountLink from "@/lib/hooks/usePlaidAccountLink";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import SyncProblemRoundedIcon from "@mui/icons-material/SyncProblemRounded";
import { Button, IconButton, Tooltip } from "@mui/material";

type PlaidConnectButtonProps = {
  onAccountsLinked?: Parameters<typeof usePlaidAccountLink>[0]["onAccountsLinked"];
  onLinkError?: Parameters<typeof usePlaidAccountLink>[0]["onLinkError"];
  render?: (trigger: ReturnType<typeof usePlaidAccountLink>) => React.ReactNode;
};

export function PlaidConnectButton({ onAccountsLinked, onLinkError, render }: PlaidConnectButtonProps) {
  const trigger = usePlaidAccountLink({ onAccountsLinked, onLinkError });

  if (render) return <>{render(trigger)}</>;

  return (
    <Button
      variant="contained"
      onClick={trigger.onClick}
      disabled={trigger.disabled}
      startIcon={<AccountBalanceIcon />}
      sx={{
        textTransform: "none",
        fontWeight: 600,
        fontSize: "15px",
        padding: "10px 20px",
        borderRadius: "8px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        backgroundColor: "#000000",
        "&:hover": { backgroundColor: "#333333" },
        "&.Mui-disabled": { backgroundColor: "#e0e0e0" },
      }}
    >
      {trigger.label}
    </Button>
  );
}

type PlaidReconnectButtonProps = {
  itemId: string;
  onSyncSuccess: () => void;
};

export function PlaidReconnectButton({ itemId, onSyncSuccess }: PlaidReconnectButtonProps) {
  const trigger = usePlaidAccountLink({
    updateModeItemId: itemId,
    onSyncSuccess,
  });

  return (
    <Tooltip title={trigger.label}>
      <span>
        <IconButton size="small" onClick={trigger.onClick} disabled={trigger.disabled} sx={{ p: 0.25, color: "#dc2626" }}>
          <SyncProblemRoundedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}
