"use client";

import { formatSyncAge, isImporting, needsAttention, oldestSync } from "@/lib/connections";
import useSyncRunning from "@/lib/hooks/useSyncRunning";
import { runSync } from "@/lib/plaidSync";
import type { PlaidConnection } from "@/lib/types/types";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import { Chip, CircularProgress, Tooltip } from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = { label: string; tooltip: string; tone: "ok" | "busy" | "attention" };

function statusFor(connections: PlaidConnection[], syncing: boolean): Status {
  const now = Date.now();
  if (syncing) return { label: "Syncing…", tooltip: "Getting new transactions from your banks.", tone: "busy" };

  const attention = connections.filter((connection) => needsAttention(connection, now)).length;
  if (attention > 0) {
    return {
      label: attention === 1 ? "1 bank needs attention" : `${attention} banks need attention`,
      tooltip: "Open Accounts to reconnect or check the bank.",
      tone: "attention",
    };
  }
  if (connections.some((connection) => isImporting(connection, now))) {
    return { label: "Importing history…", tooltip: "Plaid is still sending older transactions. Telos checks every few minutes.", tone: "busy" };
  }
  return {
    label: `Synced ${formatSyncAge(oldestSync(connections), now)}`,
    tooltip: "When your least recently synced bank last synced. Click to sync now.",
    tone: "ok",
  };
}

const TONES = {
  ok: { color: "#475569", bgcolor: "#fff", borderColor: "#e2e8f0" },
  busy: { color: "#2563eb", bgcolor: "#eff6ff", borderColor: "#bfdbfe" },
  attention: { color: "#dc2626", bgcolor: "#fef2f2", borderColor: "#fecaca" },
} as const;

/**
 * The header's sync status: "Synced 5m ago", "Syncing…", or "1 bank needs
 * attention". Click to sync now, or to open Accounts when a bank needs you.
 * Hidden until a bank is connected.
 */
export default function SyncStatusChip({ connections }: { connections: PlaidConnection[] }) {
  const router = useRouter();
  const syncing = useSyncRunning();
  // Re-renders every 30 seconds to keep "5m ago" current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 30 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (connections.length === 0) return null;

  const status = statusFor(connections, syncing);
  const tone = TONES[status.tone];
  const icon =
    status.tone === "busy" ? (
      syncing ? <CircularProgress size={12} color="inherit" /> : <SyncRoundedIcon />
    ) : status.tone === "attention" ? (
      <ErrorOutlineRoundedIcon />
    ) : (
      <CheckCircleOutlineRoundedIcon />
    );

  function handleClick() {
    if (status.tone === "attention") {
      router.push("/accounts");
      return;
    }
    if (syncing) return;
    runSync().catch((error: unknown) => console.error("[SyncStatusChip] Sync failed:", error));
  }

  return (
    <Tooltip title={status.tooltip}>
      <Chip
        icon={icon}
        label={status.label}
        onClick={handleClick}
        variant="outlined"
        size="small"
        sx={{
          height: 28,
          px: 0.5,
          fontSize: "0.78rem",
          fontWeight: 600,
          borderRadius: 2,
          ...tone,
          "& .MuiChip-icon": { color: "inherit", fontSize: 16, ml: 0.75 },
        }}
      />
    </Tooltip>
  );
}
