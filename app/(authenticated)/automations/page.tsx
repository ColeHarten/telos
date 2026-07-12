"use client";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EastRoundedIcon from "@mui/icons-material/EastRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import useAuth from "@/lib/hooks/useAuth";
import useAutomations from "@/lib/hooks/useAutomations";
import { useCategories } from "@/lib/hooks/useCategories";
import type { Category, CategoryKind } from "@/lib/types/types";

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function merchantInitial(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}

function categoryIcon(kind: CategoryKind | undefined) {
  if (kind === "income") return <TrendingUpRoundedIcon sx={{ fontSize: "18px" }} />;
  if (kind === "transfer") return <SwapHorizRoundedIcon sx={{ fontSize: "18px" }} />;
  return <TrendingDownRoundedIcon sx={{ fontSize: "18px" }} />;
}

function categoryColors(kind: CategoryKind | undefined) {
  if (kind === "income") return { bg: "#dcfce7", fg: "#16a34a" };
  if (kind === "transfer") return { bg: "#f5f3ff", fg: "#7c3aed" };
  return { bg: "#fee2e2", fg: "#dc2626" };
}

export default function AutomationsPage() {
  const { user, authLoading } = useAuth();
  const { automations, automationsLoading, deleteAutomation } = useAutomations(user, authLoading);
  const { categories = [] } = useCategories(user, authLoading);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const [searchQuery, setSearchQuery] = useState("");
  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuAutomationId, setRowMenuAutomationId] = useState<string | null>(null);

  const filteredAutomations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return automations;
    return automations.filter((automation) => {
      const categoryName = categoryById.get(automation.categoryId)?.name ?? "";
      return (
        automation.merchantLabel.toLowerCase().includes(query) ||
        categoryName.toLowerCase().includes(query)
      );
    });
  }, [automations, searchQuery, categoryById]);

  function handleOpenRowMenu(event: React.MouseEvent<HTMLElement>, automationId: string) {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuAutomationId(automationId);
  }

  function handleCloseRowMenu() {
    setRowMenuAnchor(null);
    setRowMenuAutomationId(null);
  }

  async function handleDelete() {
    if (rowMenuAutomationId) {
      await deleteAutomation(rowMenuAutomationId);
    }
    handleCloseRowMenu();
  }

  return (
    <Box sx={{ padding: "40px", backgroundColor: "#ffffff", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "flex-start" },
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <Typography sx={{ fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", fontSize: "1.9rem" }}>
          Automations
        </Typography>

        <Tooltip title="Automations are created from the Transactions page — categorize a transaction and you'll be offered the option to automate it.">
          <span>
            <Button
              variant="contained"
              disableElevation
              disabled
              startIcon={<AddRoundedIcon sx={{ fontSize: "18px" }} />}
              sx={{
                backgroundColor: "#6366f1",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.9rem",
                borderRadius: "20px",
                paddingLeft: "20px",
                paddingRight: "20px",
                paddingTop: "10px",
                paddingBottom: "10px",
                whiteSpace: "nowrap",
              }}
            >
              New Automation
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Info banner */}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: "16px",
          padding: "20px 24px",
          borderRadius: "24px",
          backgroundColor: "#f5f5fd",
          borderColor: "#e9e8fb",
          marginBottom: "32px",
        }}
      >
        <Avatar sx={{ backgroundColor: "#ede9fe", color: "#6366f1", width: "40px", height: "40px" }}>
          <AutoAwesomeRoundedIcon sx={{ fontSize: "20px" }} />
        </Avatar>
        <Box>
          <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
            Automatic categorization is on
          </Typography>
          <Typography sx={{ color: "#64748b", fontSize: "0.85rem", marginTop: "2px" }}>
            New transactions are matched against your categories automatically. Automations you create below
            always take priority over that automatic matching.
          </Typography>
        </Box>
      </Paper>

      {/* Section header */}
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.15rem" }}>
            Your Automations
          </Typography>
          <Chip
            size="small"
            label={automations.length}
            sx={{ height: "24px", fontSize: "0.8rem", fontWeight: 600, backgroundColor: "#f1f5f9", color: "#475569" }}
          />
        </Box>

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
                  <SearchRoundedIcon sx={{ color: "#94a3b8", fontSize: "18px" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            minWidth: "280px",
            "& .MuiOutlinedInput-root": {
              borderRadius: "20px",
              fontSize: "0.9rem",
              backgroundColor: "#f8fafc",
              "& fieldset": { borderColor: "#e2e8f0" },
              "&:hover fieldset": { borderColor: "#cbd5e1" },
            },
          }}
        />
      </Box>

      {/* Automation rows */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {automationsLoading ? (
          <Paper variant="outlined" sx={{ padding: "32px", borderRadius: "24px", borderColor: "#e2e8f0", textAlign: "center" }}>
            <Typography sx={{ color: "#94a3b8", fontSize: "0.9rem" }}>Loading automations…</Typography>
          </Paper>
        ) : filteredAutomations.length === 0 ? (
          <Paper variant="outlined" sx={{ padding: "32px", borderRadius: "24px", borderColor: "#e2e8f0", textAlign: "center" }}>
            <Typography sx={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              {automations.length === 0
                ? "No automations yet. Categorize a transaction to create one."
                : "No automations match your search."}
            </Typography>
          </Paper>
        ) : (
          filteredAutomations.map((automation) => {
            const category = categoryById.get(automation.categoryId);
            const colors = categoryColors(category?.kind);

            return (
              <Paper
                key={automation.id}
                variant="outlined"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 24px",
                  borderRadius: "24px",
                  borderColor: "#e2e8f0",
                  "&:hover": { borderColor: "#cbd5e1" },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: "24px", flex: 1, minWidth: 0 }}>
                  <Avatar sx={{ width: "44px", height: "44px", backgroundColor: "#f1f5f9", color: "#475569" }}>
                    {merchantInitial(automation.merchantLabel)}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                      {automation.merchantLabel}
                    </Typography>
                    <Typography sx={{ color: "#94a3b8", fontSize: "0.82rem" }}>Merchant</Typography>
                  </Box>
                </Box>

                <EastRoundedIcon
                  sx={{ fontSize: "18px", color: "#cbd5e1", marginLeft: "24px", marginRight: "24px", flexShrink: 0 }}
                />

                <Box sx={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                  <Avatar sx={{ width: "40px", height: "40px", backgroundColor: colors.bg, color: colors.fg }}>
                    {categoryIcon(category?.kind)}
                  </Avatar>
                  <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                    {category?.name ?? "Unknown category"}
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  sx={{ color: "#94a3b8", flexShrink: 0 }}
                  onClick={(event) => handleOpenRowMenu(event, automation.id)}
                >
                  <MoreVertRoundedIcon fontSize="small" />
                </IconButton>
              </Paper>
            );
          })
        )}
      </Box>

      {/* Footer note */}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "20px 24px",
          borderRadius: "24px",
          backgroundColor: "#f8fafc",
          borderColor: "#e2e8f0",
          marginTop: "24px",
        }}
      >
        <Avatar sx={{ backgroundColor: "#e2e8f0", color: "#64748b", width: "36px", height: "36px" }}>
          <VerifiedUserRoundedIcon sx={{ fontSize: "18px" }} />
        </Avatar>
        <Box>
          <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.9rem" }}>
            Automations always override automatic categorization.
          </Typography>
          <Typography sx={{ color: "#64748b", fontSize: "0.85rem" }}>
            Recreating an automation for the same merchant overwrites the old one.
          </Typography>
        </Box>
      </Paper>

      {/* Row action menu */}
      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu}>
        <MenuItem
          onClick={handleDelete}
          sx={{ fontSize: "0.85rem", color: "error.main", display: "flex", gap: "8px" }}
        >
          <DeleteOutlineRoundedIcon fontSize="small" />
          Delete automation
        </MenuItem>
      </Menu>
    </Box>
  );
}