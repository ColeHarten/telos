"use client";

import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import LocalGasStationOutlinedIcon from "@mui/icons-material/LocalGasStationOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import { Avatar } from "@mui/material";
import type { ReactNode } from "react";

type Fallback = { bgcolor: string; color: string; icon: ReactNode };

// The look for merchants without a Plaid logo, from words in the name.
function fallbackFor(name: string, fontSize: number): Fallback {
  const n = name.toLowerCase();
  const icon = (Icon: typeof StorefrontOutlinedIcon) => <Icon sx={{ fontSize }} />;

  if (n.includes("costco")) return { bgcolor: "#dc2626", color: "#fff", icon: icon(ShoppingCartOutlinedIcon) };
  if (n.includes("spotify")) return { bgcolor: "#16a34a", color: "#fff", icon: icon(MusicNoteOutlinedIcon) };
  if (n.includes("paycheck") || n.includes("payroll") || n.includes("deposit")) {
    return { bgcolor: "#2563eb", color: "#fff", icon: icon(PaidOutlinedIcon) };
  }
  if (n.includes("shell") || n.includes("gas") || n.includes("chevron") || n.includes("exxon")) {
    return { bgcolor: "#ea580c", color: "#fff", icon: icon(LocalGasStationOutlinedIcon) };
  }
  if (n.includes("netflix")) return { bgcolor: "#dc2626", color: "#fff", icon: icon(MovieOutlinedIcon) };
  if (n.includes("chase") || n.includes("bank")) return { bgcolor: "#0f172a", color: "#fff", icon: icon(AccountBalanceOutlinedIcon) };
  return { bgcolor: "#f1f5f9", color: "#64748b", icon: icon(StorefrontOutlinedIcon) };
}

type MerchantAvatarProps = {
  name: string;
  /** Plaid's merchant logo, when it has one. */
  logoUrl?: string | null;
  size?: number;
};

/** The merchant's Plaid logo, or an icon picked from its name. A logo that fails to load falls back to the icon. */
export default function MerchantAvatar({ name, logoUrl, size = 34 }: MerchantAvatarProps) {
  const fallback = fallbackFor(name, Math.round(size * 0.53));

  if (logoUrl) {
    return (
      <Avatar
        src={logoUrl}
        alt=""
        slotProps={{ img: { loading: "lazy", referrerPolicy: "no-referrer" } }}
        sx={{ width: size, height: size, bgcolor: "#fff", color: "#64748b", border: "1px solid #e2e8f0" }}
      >
        {fallback.icon}
      </Avatar>
    );
  }

  return (
    <Avatar sx={{ width: size, height: size, bgcolor: fallback.bgcolor, color: fallback.color }}>
      {fallback.icon}
    </Avatar>
  );
}
