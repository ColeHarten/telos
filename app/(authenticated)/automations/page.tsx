"use client";

// Boilerplate Automations page.
// TODO: replace MOCK_AUTOMATIONS and the row-menu handlers with real data via
// a useAutomations(user, authLoading) hook, following the same pattern as
// useAccounts / useTransactions elsewhere in this app.

import AttachMoneyRoundedIcon from "@mui/icons-material/AttachMoneyRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ConfirmationNumberRoundedIcon from "@mui/icons-material/ConfirmationNumberRounded";
import DirectionsCarFilledRoundedIcon from "@mui/icons-material/DirectionsCarFilledRounded";
import EastRoundedIcon from "@mui/icons-material/EastRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LocalCafeRoundedIcon from "@mui/icons-material/LocalCafeRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShoppingBagRoundedIcon from "@mui/icons-material/ShoppingBagRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import {
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

// ---- Types ----

interface AutomationRule {
  id: string;
  sourceLabel: string;
  sourceSublabel: string;
  sourceIcon: React.ReactNode;
  sourceIconBg: string;
  sourceIconColor: string;
  targetLabel: string;
  targetIcon: React.ReactNode;
  targetIconBg: string;
  targetIconColor: string;
}

// ---- Mock data (replace with real automations from the backend) ----

const MOCK_AUTOMATIONS: AutomationRule[] = [
  {
    id: "a1",
    sourceLabel: "Starbucks",
    sourceSublabel: "Merchant",
    sourceIcon: <LocalCafeRoundedIcon sx={{ fontSize: 18 }} />,
    sourceIconBg: "#1e6b47",
    sourceIconColor: "#ffffff",
    targetLabel: "Coffee",
    targetIcon: <LocalCafeRoundedIcon sx={{ fontSize: 18 }} />,
    targetIconBg: "#ede9fe",
    targetIconColor: "#7c3aed",
  },
  {
    id: "a2",
    sourceLabel: "Amazon",
    sourceSublabel: 'Merchant contains "Amazon"',
    sourceIcon: (
      <Typography sx={{ fontWeight: 700, fontSize: "1rem", color: "#ff9900" }}>a</Typography>
    ),
    sourceIconBg: "#111111",
    sourceIconColor: "#ff9900",
    targetLabel: "Shopping",
    targetIcon: <ShoppingBagRoundedIcon sx={{ fontSize: 18 }} />,
    targetIconBg: "#dcfce7",
    targetIconColor: "#16a34a",
  },
  {
    id: "a3",
    sourceLabel: "Netflix",
    sourceSublabel: "Merchant",
    sourceIcon: (
      <Typography sx={{ fontWeight: 800, fontSize: "1rem", color: "#ffffff" }}>N</Typography>
    ),
    sourceIconBg: "#e50914",
    sourceIconColor: "#ffffff",
    targetLabel: "Entertainment",
    targetIcon: <ConfirmationNumberRoundedIcon sx={{ fontSize: 18 }} />,
    targetIconBg: "#fee2e2",
    targetIconColor: "#dc2626",
  },
  {
    id: "a4",
    sourceLabel: "Payroll",
    sourceSublabel: 'Merchant contains "Payroll"',
    sourceIcon: <HomeRoundedIcon sx={{ fontSize: 18 }} />,
    sourceIconBg: "#e2e8f0",
    sourceIconColor: "#475569",
    targetLabel: "Salary",
    targetIcon: <AttachMoneyRoundedIcon sx={{ fontSize: 18 }} />,
    targetIconBg: "#dcfce7",
    targetIconColor: "#16a34a",
  },
  {
    id: "a5",
    sourceLabel: "Electricity",
    sourceSublabel: "Plaid category is Utilities",
    sourceIcon: <AutoAwesomeRoundedIcon sx={{ fontSize: 18 }} />,
    sourceIconBg: "#dbeafe",
    sourceIconColor: "#2563eb",
    targetLabel: "Utilities",
    targetIcon: <HomeRoundedIcon sx={{ fontSize: 18 }} />,
    targetIconBg: "#dbeafe",
    targetIconColor: "#2563eb",
  },
  {
    id: "a6",
    sourceLabel: "Uber",
    sourceSublabel: "Merchant",
    sourceIcon: (
      <Typography sx={{ fontWeight: 800, fontSize: "0.7rem", color: "#ffffff" }}>Uber</Typography>
    ),
    sourceIconBg: "#000000",
    sourceIconColor: "#ffffff",
    targetLabel: "Transport",
    targetIcon: <DirectionsCarFilledRoundedIcon sx={{ fontSize: 18 }} />,
    targetIconBg: "#fef3c7",
    targetIconColor: "#d97706",
  },
  {
    id: "a7",
    sourceLabel: "Spotify",
    sourceSublabel: "Merchant",
    sourceIcon: <MusicNoteRoundedIcon sx={{ fontSize: 18 }} />,
    sourceIconBg: "#1db954",
    sourceIconColor: "#ffffff",
    targetLabel: "Subscriptions",
    targetIcon: <MusicNoteRoundedIcon sx={{ fontSize: 18 }} />,
    targetIconBg: "#fce7f3",
    targetIconColor: "#db2777",
  },
];

export default function AutomationsPage() {
  const [automations] = useState<AutomationRule[]>(MOCK_AUTOMATIONS);
  const [searchQuery, setSearchQuery] = useState("");

  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuRuleId, setRowMenuRuleId] = useState<string | null>(null);

  const filteredAutomations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return automations;
    return automations.filter(
      (rule) =>
        rule.sourceLabel.toLowerCase().includes(query) ||
        rule.sourceSublabel.toLowerCase().includes(query) ||
        rule.targetLabel.toLowerCase().includes(query)
    );
  }, [automations, searchQuery]);

  function handleOpenRowMenu(event: React.MouseEvent<HTMLElement>, ruleId: string) {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuRuleId(ruleId);
  }

  function handleCloseRowMenu() {
    setRowMenuAnchor(null);
    setRowMenuRuleId(null);
  }

  return (
    <Box sx={{ p: 5, bgcolor: "#ffffff", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", sm: "flex-start" }, justifyContent: "space-between", mb: 4 }}
      >
        <Box>
          <Typography sx={{ fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", fontSize: "1.9rem" }}>
            Automations
          </Typography>
        </Box>

        <Button
          variant="contained"
          disableElevation
          startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
          sx={{
            bgcolor: "#6366f1",
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
            borderRadius: 2.5,
            px: 2.5,
            py: 1.25,
            whiteSpace: "nowrap",
            "&:hover": { bgcolor: "#4f46e5" },
          }}
        >
          New Automation
        </Button>
      </Stack>

      {/* Info banner */}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
          px: 3,
          py: 2.5,
          borderRadius: 3,
          bgcolor: "#f5f5fd",
          borderColor: "#e9e8fb",
          mb: 4,
        }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
          <Avatar sx={{ bgcolor: "#ede9fe", color: "#6366f1", width: 40, height: 40 }}>
            <AutoAwesomeRoundedIcon sx={{ fontSize: 20 }} />
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
              Automatic categorization is on
            </Typography>
            <Typography sx={{ color: "#64748b", fontSize: "0.85rem", mt: 0.25 }}>
              New transactions are categorized automatically using merchant information and transaction patterns.
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.25 }}>
              <Typography sx={{ color: "#64748b", fontSize: "0.85rem" }}>
                Your automations always override automatic categorization.
              </Typography>
            </Stack>
          </Box>
        </Stack>
        <Button
          sx={{
            color: "#6366f1",
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.85rem",
            flexShrink: 0,
            alignSelf: "center",
          }}
        >
          Learn more
        </Button>
      </Paper>

      {/* Section header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", mb: 2.5 }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.15rem" }}>
            Your Automations
          </Typography>
          <Chip
            size="small"
            label={automations.length}
            sx={{ height: 24, fontSize: "0.8rem", fontWeight: 600, bgcolor: "#f1f5f9", color: "#475569" }}
          />
        </Stack>

        <TextField
          size="small"
          placeholder="Search automations"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          slotProps={{
            input: {
              sx: { fontSize: "0.9rem" },
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ color: "#94a3b8", fontSize: 18 }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            minWidth: 280,
            "& .MuiOutlinedInput-root": {
              borderRadius: 2.5,
              fontSize: "0.9rem",
              bgcolor: "#f8fafc",
              "& fieldset": { borderColor: "#e2e8f0" },
              "&:hover fieldset": { borderColor: "#cbd5e1" },
            },
          }}
        />
      </Stack>

      {/* Automation rows */}
      <Stack spacing={1.5}>
        {filteredAutomations.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, borderColor: "#e2e8f0", textAlign: "center" }}>
            <Typography sx={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              No automations match your search.
            </Typography>
          </Paper>
        ) : (
          filteredAutomations.map((rule) => (
            <Paper
              key={rule.id}
              variant="outlined"
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 3,
                py: 2,
                borderRadius: 3,
                borderColor: "#e2e8f0",
                "&:hover": { borderColor: "#cbd5e1" },
              }}
            >
              <Stack direction="row" spacing={3} sx={{ alignItems: "center", flex: 1, minWidth: 0 }}>
                <Avatar sx={{ width: 44, height: 44, bgcolor: rule.sourceIconBg, color: rule.sourceIconColor }}>
                  {rule.sourceIcon}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                    {rule.sourceLabel}
                  </Typography>
                  <Typography sx={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                    {rule.sourceSublabel}
                  </Typography>
                </Box>
              </Stack>

              <EastRoundedIcon sx={{ fontSize: 18, color: "#cbd5e1", mx: 3, flexShrink: 0 }} />

              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1, minWidth: 0 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: rule.targetIconBg, color: rule.targetIconColor }}>
                  {rule.targetIcon}
                </Avatar>
                <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                  {rule.targetLabel}
                </Typography>
              </Stack>

              <IconButton
                size="small"
                sx={{ color: "#94a3b8", flexShrink: 0 }}
                onClick={(event) => handleOpenRowMenu(event, rule.id)}
              >
                <MoreVertRoundedIcon fontSize="small" />
              </IconButton>
            </Paper>
          ))
        )}
      </Stack>

      {/* Footer note */}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 3,
          py: 2.5,
          borderRadius: 3,
          bgcolor: "#f8fafc",
          borderColor: "#e2e8f0",
          mt: 3,
        }}
      >
        <Avatar sx={{ bgcolor: "#e2e8f0", color: "#64748b", width: 36, height: 36 }}>
          <VerifiedUserRoundedIcon sx={{ fontSize: 18 }} />
        </Avatar>
        <Box>
          <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.9rem" }}>
            Manual automations always override automatic categorization.
          </Typography>
          <Typography sx={{ color: "#64748b", fontSize: "0.85rem" }}>
            More specific automations take precedence over general ones.
          </Typography>
        </Box>
      </Paper>

      {/* Row action menu */}
      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu}>
        <MenuItem onClick={handleCloseRowMenu} sx={{ fontSize: "0.85rem" }}>Edit automation</MenuItem>
        <MenuItem onClick={handleCloseRowMenu} sx={{ fontSize: "0.85rem" }}>Duplicate</MenuItem>
        <MenuItem onClick={handleCloseRowMenu} sx={{ fontSize: "0.85rem", color: "error.main" }}>Delete</MenuItem>
      </Menu>
    </Box>
  );
}