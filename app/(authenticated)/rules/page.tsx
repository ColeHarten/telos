"use client";

// Boilerplate Rules ("Automations") page.
// TODO: replace MOCK_CUSTOM_RULES / MOCK_DEFAULT_RULES and the status-toggle /
// reorder handlers with real data via a useRules(user, authLoading) hook,
// following the same pattern as useAccounts / useTransactions elsewhere in
// this app.

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import DirectionsCarFilledRoundedIcon from "@mui/icons-material/DirectionsCarFilledRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import LocalGasStationRoundedIcon from "@mui/icons-material/LocalGasStationRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import EastRoundedIcon from "@mui/icons-material/EastRounded";
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
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

// ---- Types ----

type RuleTab = "all" | "custom" | "default" | "disabled";
type TypeFilter = "all" | "custom" | "default";
type StatusFilter = "all" | "enabled" | "disabled";

interface AutomationRule {
  id: string;
  isCustom: boolean;
  priority?: number;
  name: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  category: string;
  matches: number;
  lastMatched: string;
  enabled: boolean;
}

// ---- Mock data (replace with real rules from the backend) ----

const CATEGORY_STYLES: Record<string, { color: string; bg: string }> = {
  Transportation: { color: "#16a34a", bg: "#f0fdf4" },
  Shopping: { color: "#7c3aed", bg: "#f5f3ff" },
  Rent: { color: "#dc2626", bg: "#fef2f2" },
  "401k Transfer": { color: "#ea580c", bg: "#fff7ed" },
  "CC Payment Transfer": { color: "#2563eb", bg: "#eff6ff" },
  "Dining Out": { color: "#16a34a", bg: "#f0fdf4" },
  Gas: { color: "#dc2626", bg: "#fef2f2" },
};

const MOCK_CUSTOM_RULES: AutomationRule[] = [
  {
    id: "c1",
    isCustom: true,
    priority: 1,
    name: "Uber and Lyft",
    description: 'Merchant name starts with "UBER" or "LYFT"',
    icon: <DirectionsCarFilledRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#f0fdf4",
    iconColor: "#16a34a",
    category: "Transportation",
    matches: 128,
    lastMatched: "Jun 30, 2026",
    enabled: true,
  },
  {
    id: "c2",
    isCustom: true,
    priority: 2,
    name: "Amazon Purchases",
    description: 'Merchant name contains "AMAZON"',
    icon: <ShoppingCartRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#f5f3ff",
    iconColor: "#7c3aed",
    category: "Shopping",
    matches: 210,
    lastMatched: "Jul 1, 2026",
    enabled: true,
  },
  {
    id: "c3",
    isCustom: true,
    priority: 3,
    name: "Rent Payments",
    description: 'Description contains "RENT"',
    icon: <HomeRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#fef2f2",
    iconColor: "#dc2626",
    category: "Rent",
    matches: 24,
    lastMatched: "Jun 29, 2026",
    enabled: true,
  },
  {
    id: "c4",
    isCustom: true,
    priority: 4,
    name: "401k Contributions",
    description: 'Description contains "401K" or "RETIREMENT"',
    icon: <SavingsRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#fff7ed",
    iconColor: "#ea580c",
    category: "401k Transfer",
    matches: 36,
    lastMatched: "Jun 28, 2026",
    enabled: true,
  },
  {
    id: "c5",
    isCustom: true,
    priority: 5,
    name: "Credit Card Payments",
    description: 'Transaction type is "Payment"',
    icon: <CreditCardRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#eff6ff",
    iconColor: "#2563eb",
    category: "CC Payment Transfer",
    matches: 54,
    lastMatched: "Jun 27, 2026",
    enabled: true,
  },
];

const MOCK_CUSTOM_RULES_EXTRA: AutomationRule[] = [
  {
    id: "c6",
    isCustom: true,
    priority: 6,
    name: "Streaming Subscriptions",
    description: 'Merchant name contains "NETFLIX", "HULU", or "SPOTIFY"',
    icon: <ShoppingCartRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#f5f3ff",
    iconColor: "#7c3aed",
    category: "Shopping",
    matches: 41,
    lastMatched: "Jun 25, 2026",
    enabled: true,
  },
  {
    id: "c7",
    isCustom: true,
    priority: 7,
    name: "Gym Membership",
    description: 'Merchant name contains "PLANET FITNESS"',
    icon: <HomeRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#fef2f2",
    iconColor: "#dc2626",
    category: "Rent",
    matches: 12,
    lastMatched: "Jun 20, 2026",
    enabled: false,
  },
];

const MOCK_DEFAULT_RULES: AutomationRule[] = [
  {
    id: "d1",
    isCustom: false,
    name: "Restaurants",
    description: "Automatically mapped from Plaid category",
    icon: <RestaurantRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#f0fdf4",
    iconColor: "#16a34a",
    category: "Dining Out",
    matches: 1245,
    lastMatched: "Jul 1, 2026",
    enabled: true,
  },
  {
    id: "d2",
    isCustom: false,
    name: "Gas Stations",
    description: "Automatically mapped from Plaid category",
    icon: <LocalGasStationRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#fef2f2",
    iconColor: "#dc2626",
    category: "Gas",
    matches: 342,
    lastMatched: "Jun 30, 2026",
    enabled: true,
  },
];

const MOCK_DEFAULT_RULES_EXTRA: AutomationRule[] = [
  {
    id: "d3",
    isCustom: false,
    name: "Groceries",
    description: "Automatically mapped from Plaid category",
    icon: <ShoppingCartRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#f5f3ff",
    iconColor: "#7c3aed",
    category: "Shopping",
    matches: 587,
    lastMatched: "Jun 29, 2026",
    enabled: true,
  },
  {
    id: "d4",
    isCustom: false,
    name: "Utilities",
    description: "Automatically mapped from Plaid category",
    icon: <HomeRoundedIcon sx={{ fontSize: 18 }} />,
    iconBg: "#fef2f2",
    iconColor: "#dc2626",
    category: "Rent",
    matches: 96,
    lastMatched: "Jun 26, 2026",
    enabled: false,
  },
];

const RULE_TABS: { value: RuleTab; label: string; count: number }[] = [
  { value: "all", label: "All Rules", count: 42 },
  { value: "custom", label: "Custom", count: 17 },
  { value: "default", label: "Default", count: 25 },
  { value: "disabled", label: "Disabled", count: 3 },
];

function CategoryChip({ category }: { category: string }) {
  const style = CATEGORY_STYLES[category] ?? { color: "#64748b", bg: "#f1f5f9" };
  return (
    <Chip
      label={category}
      size="small"
      sx={{
        height: 22,
        fontSize: "0.7rem",
        fontWeight: 700,
        color: style.color,
        bgcolor: style.bg,
        borderRadius: 1.5,
      }}
    />
  );
}

export default function RulesPage() {
  const [customRules, setCustomRules] = useState<AutomationRule[]>(MOCK_CUSTOM_RULES);
  const [defaultRules, setDefaultRules] = useState<AutomationRule[]>(MOCK_DEFAULT_RULES);
  const [showAllCustom, setShowAllCustom] = useState(false);
  const [showAllDefault, setShowAllDefault] = useState(false);

  const [activeTab, setActiveTab] = useState<RuleTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [newRuleMenuAnchor, setNewRuleMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuRuleId, setRowMenuRuleId] = useState<string | null>(null);

  const visibleCustomRules = useMemo(
    () => (showAllCustom ? [...customRules, ...MOCK_CUSTOM_RULES_EXTRA] : customRules),
    [customRules, showAllCustom]
  );
  const visibleDefaultRules = useMemo(
    () => (showAllDefault ? [...defaultRules, ...MOCK_DEFAULT_RULES_EXTRA] : defaultRules),
    [defaultRules, showAllDefault]
  );

  const allRules = useMemo(
    () => [...visibleCustomRules, ...visibleDefaultRules],
    [visibleCustomRules, visibleDefaultRules]
  );

  function matchesFilters(rule: AutomationRule) {
    const query = searchQuery.trim().toLowerCase();
    if (query && !rule.name.toLowerCase().includes(query) && !rule.description.toLowerCase().includes(query)) {
      return false;
    }
    if (typeFilter === "custom" && !rule.isCustom) return false;
    if (typeFilter === "default" && rule.isCustom) return false;
    if (statusFilter === "enabled" && !rule.enabled) return false;
    if (statusFilter === "disabled" && rule.enabled) return false;
    return true;
  }

  const filteredCustomRules = visibleCustomRules.filter(matchesFilters);
  const filteredDefaultRules = visibleDefaultRules.filter(matchesFilters);
  const filteredDisabledRules = allRules.filter((rule) => !rule.enabled).filter(matchesFilters);

  function toggleRuleStatus(rule: AutomationRule) {
    if (rule.isCustom) {
      setCustomRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    } else {
      setDefaultRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    }
  }

  function handleOpenRowMenu(event: React.MouseEvent<HTMLElement>, ruleId: string) {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuRuleId(ruleId);
  }

  function handleCloseRowMenu() {
    setRowMenuAnchor(null);
    setRowMenuRuleId(null);
  }

  return (
    <Stack spacing={3} sx={{ p: 4, bgcolor: "#f8fafc", minHeight: "100vh", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: "#0f172a", letterSpacing: "-0.03em", fontSize: "1.75rem" }}>
            Automations
          </Typography>
          <Typography variant="body2" sx={{ color: "#64748b", mt: 0.5, fontSize: "0.9rem" }}>
            Create rules to automatically categorize transactions to your cashflows or transfers.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<TrendingUpRoundedIcon sx={{ color: "#2563eb", fontSize: 18 }} />}
            sx={{
              borderColor: "#bfdbfe",
              color: "#2563eb",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              bgcolor: "#fff",
              px: 1.75,
              py: 0.85,
              whiteSpace: "nowrap",
              "&:hover": { borderColor: "#93c5fd", bgcolor: "#eff6ff" },
            }}
          >
            Insights
          </Button>

          <Button
            variant="contained"
            disableElevation
            startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
            endIcon={<KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={(event) => setNewRuleMenuAnchor(event.currentTarget)}
            sx={{
              bgcolor: "#2563eb",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
              borderRadius: 2,
              px: 1.75,
              py: 0.85,
              whiteSpace: "nowrap",
              "&:hover": { bgcolor: "#1d4ed8" },
            }}
          >
            New Rule
          </Button>

          <Menu
            anchorEl={newRuleMenuAnchor}
            open={Boolean(newRuleMenuAnchor)}
            onClose={() => setNewRuleMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: { mt: 1, borderRadius: 3, minWidth: 220, border: "1px solid #e2e8f0" } } }}
          >
            <MenuItem onClick={() => setNewRuleMenuAnchor(null)} sx={{ fontSize: "0.85rem", fontWeight: 600 }}>
              Create Custom Rule
            </MenuItem>
            <MenuItem onClick={() => setNewRuleMenuAnchor(null)} sx={{ fontSize: "0.85rem", fontWeight: 600 }}>
              New from Transaction
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>

      {/* Top Metric Cards */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0", position: "relative" }}>
          <Tooltip title="All rules currently configured, custom and default">
            <IconButton size="small" sx={{ position: "absolute", top: 12, right: 12, color: "#cbd5e1" }}>
              <InfoOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Avatar sx={{ bgcolor: "#f0fdf4", color: "#16a34a", width: 44, height: 44 }}>
              <TuneRoundedIcon sx={{ fontSize: 20 }} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Total Rules</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em", fontSize: "1.5rem" }}>42</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.75rem" }}>Active</Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0", position: "relative" }}>
          <Tooltip title="Rules you've created manually">
            <IconButton size="small" sx={{ position: "absolute", top: 12, right: 12, color: "#cbd5e1" }}>
              <InfoOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Avatar sx={{ bgcolor: "#f5f3ff", color: "#7c3aed", width: 44, height: 44 }}>
              <TuneRoundedIcon sx={{ fontSize: 20 }} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Custom Rules</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em", fontSize: "1.5rem" }}>17</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.75rem" }}>Active</Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0", position: "relative" }}>
          <Tooltip title="Share of transactions categorized without manual review">
            <IconButton size="small" sx={{ position: "absolute", top: 12, right: 12, color: "#cbd5e1" }}>
              <InfoOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Avatar sx={{ bgcolor: "#eff6ff", color: "#2563eb", width: 44, height: 44 }}>
              <ShieldOutlinedIcon sx={{ fontSize: 20 }} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Auto-Categorization Rate</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em", fontSize: "1.5rem" }}>96.8%</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.75rem" }}>Last 30 days</Typography>
            </Box>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0", position: "relative" }}>
          <Tooltip title="Transactions no rule matched, needing manual categorization">
            <IconButton size="small" sx={{ position: "absolute", top: 12, right: 12, color: "#cbd5e1" }}>
              <InfoOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Avatar sx={{ bgcolor: "#fff7ed", color: "#ea580c", width: 44, height: 44 }}>
              <WarningAmberRoundedIcon sx={{ fontSize: 20 }} />
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ color: "#64748b", fontWeight: 500, fontSize: "0.85rem" }}>Transactions Needing Review</Typography>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em", fontSize: "1.5rem" }}>23</Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.75rem" }}>Last 30 days</Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>

      {/* Info banner */}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          px: 2.5,
          py: 1.5,
          borderRadius: 3,
          bgcolor: "#eff6ff",
          borderColor: "#bfdbfe",
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <InfoOutlinedIcon sx={{ color: "#2563eb", fontSize: 20 }} />
          <Typography variant="body2" sx={{ color: "#1e3a8a", fontSize: "0.85rem" }}>
            Custom rules always override automatic mappings. Drag and drop to reorder your rules by priority.
          </Typography>
        </Stack>
        <Button
          endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />}
          sx={{ color: "#2563eb", textTransform: "none", fontWeight: 600, fontSize: "0.85rem", flexShrink: 0 }}
        >
          Learn more about automations
        </Button>
      </Paper>

      {/* Tabs + Filters */}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", bgcolor: "#fff", borderColor: "#e2e8f0" }}>
        <Box sx={{ px: 3, pt: 1, pb: 1.5, borderBottom: "1px solid #f1f5f9" }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between" }}
          >
            <Tabs
              value={activeTab}
              onChange={(_event, value) => setActiveTab(value as RuleTab)}
              sx={{ minHeight: 40, "& .MuiTabs-indicator": { height: 2.5 } }}
            >
              {RULE_TABS.map((tab) => (
                <Tab
                  key={tab.value}
                  value={tab.value}
                  disableRipple
                  sx={{ minHeight: 40, textTransform: "none", fontWeight: 700, fontSize: "0.85rem", color: "#64748b", "&.Mui-selected": { color: "#2563eb" } }}
                  label={
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                      <Box>{tab.label}</Box>
                      <Chip size="small" label={tab.count} sx={{ height: 20, fontSize: "0.7rem", bgcolor: "#f1f5f9" }} />
                    </Stack>
                  }
                />
              ))}
            </Tabs>

            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1.25 }}>
              <TextField
                size="small"
                placeholder="Search rules..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                slotProps={{
                  input: {
                    sx: { fontSize: "0.85rem" },
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon sx={{ color: "#94a3b8", fontSize: 18 }} />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{
                  minWidth: 200,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    fontSize: "0.875rem",
                    "& fieldset": { borderColor: "#e2e8f0" },
                    "&:hover fieldset": { borderColor: "#cbd5e1" },
                  },
                }}
              />

              <Select
                size="small"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                sx={{ minWidth: 130, borderRadius: 2, fontSize: "0.85rem", fontWeight: 600, bgcolor: "#fff" }}
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
                <MenuItem value="default">Default</MenuItem>
              </Select>

              <Select
                size="small"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                sx={{ minWidth: 130, borderRadius: 2, fontSize: "0.85rem", fontWeight: 600, bgcolor: "#fff" }}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="enabled">Enabled</MenuItem>
                <MenuItem value="disabled">Disabled</MenuItem>
              </Select>

              <Button
                variant="outlined"
                startIcon={<TuneRoundedIcon sx={{ fontSize: 16 }} />}
                sx={{
                  borderColor: "#e2e8f0",
                  color: "#334155",
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  borderRadius: 2,
                  px: 1.75,
                  whiteSpace: "nowrap",
                  "&:hover": { borderColor: "#cbd5e1", bgcolor: "#f8fafc" },
                }}
              >
                More Filters
              </Button>
            </Stack>
          </Stack>
        </Box>

        {/* Custom Rules */}
        {(activeTab === "all" || activeTab === "custom") && (
          <Box>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", px: 3, pt: 2.5, pb: 1.5 }}>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>Custom Rules</Typography>
              <Chip
                size="small"
                icon={<DragIndicatorRoundedIcon sx={{ fontSize: 14 }} />}
                label="Drag to reorder"
                sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: "#f1f5f9", color: "#64748b" }}
              />
            </Stack>

            {filteredCustomRules.length === 0 ? (
              <Box sx={{ px: 3, pb: 3 }}>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>No custom rules match the current filters.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ borderBottom: "1px solid #e2e8f0" }}>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem", width: 40 }} />
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Priority</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Rule</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Then assign to</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Matches</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Last matched</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem", pr: 3 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCustomRules.map((rule) => (
                      <TableRow key={rule.id} sx={{ "&:hover": { backgroundColor: "#f8fafc" }, "& td": { py: 1.5, borderBottom: "1px solid #f1f5f9" } }}>
                        <TableCell sx={{ color: "#cbd5e1", cursor: "grab" }}>
                          <DragIndicatorRoundedIcon sx={{ fontSize: 18 }} />
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: 1.5,
                              border: "1px solid #e2e8f0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              color: "#334155",
                            }}
                          >
                            {rule.priority}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                            <Avatar sx={{ width: 32, height: 32, bgcolor: rule.iconBg, color: rule.iconColor }}>{rule.icon}</Avatar>
                            <Box>
                              <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.85rem", lineHeight: 1.3 }}>{rule.name}</Typography>
                              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.75rem" }}>{rule.description}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <EastRoundedIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
                            <CategoryChip category={rule.category} />
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: "#334155", fontSize: "0.85rem" }}>{rule.matches.toLocaleString()}</TableCell>
                        <TableCell sx={{ color: "#334155", fontSize: "0.85rem", whiteSpace: "nowrap" }}>{rule.lastMatched}</TableCell>
                        <TableCell>
                          <Switch size="small" checked={rule.enabled} onChange={() => toggleRuleStatus(rule)} />
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 3 }}>
                          <IconButton size="small" sx={{ color: "#94a3b8" }} onClick={(event) => handleOpenRowMenu(event, rule.id)}>
                            <MoreHorizRoundedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {!showAllCustom && (
              <Box sx={{ textAlign: "center", py: 1.5 }}>
                <Button
                  onClick={() => setShowAllCustom(true)}
                  endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 18 }} />}
                  sx={{ color: "#2563eb", textTransform: "none", fontWeight: 600, fontSize: "0.85rem" }}
                >
                  Show 12 more custom rules
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Default Mappings */}
        {(activeTab === "all" || activeTab === "default") && (
          <Box sx={{ borderTop: activeTab === "all" ? "1px solid #f1f5f9" : "none" }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", px: 3, pt: 2.5, pb: 1.5 }}>
              <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>Default Mappings</Typography>
              <Chip
                size="small"
                label="System generated"
                sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: "#f1f5f9", color: "#64748b" }}
              />
            </Stack>

            {filteredDefaultRules.length === 0 ? (
              <Box sx={{ px: 3, pb: 3 }}>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>No default mappings match the current filters.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ borderBottom: "1px solid #e2e8f0" }}>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Rule</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Then assign to</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Matches</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Last matched</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem", pr: 3 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredDefaultRules.map((rule) => (
                      <TableRow key={rule.id} sx={{ "&:hover": { backgroundColor: "#f8fafc" }, "& td": { py: 1.5, borderBottom: "1px solid #f1f5f9" } }}>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                            <Avatar sx={{ width: 32, height: 32, bgcolor: rule.iconBg, color: rule.iconColor }}>{rule.icon}</Avatar>
                            <Box>
                              <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.85rem", lineHeight: 1.3 }}>{rule.name}</Typography>
                              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.75rem" }}>{rule.description}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <EastRoundedIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
                            <CategoryChip category={rule.category} />
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: "#334155", fontSize: "0.85rem" }}>{rule.matches.toLocaleString()}</TableCell>
                        <TableCell sx={{ color: "#334155", fontSize: "0.85rem", whiteSpace: "nowrap" }}>{rule.lastMatched}</TableCell>
                        <TableCell>
                          <Switch size="small" checked={rule.enabled} onChange={() => toggleRuleStatus(rule)} />
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 3 }}>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                            <IconButton size="small" sx={{ color: "#94a3b8" }} onClick={(event) => handleOpenRowMenu(event, rule.id)}>
                              <MoreHorizRoundedIcon fontSize="small" />
                            </IconButton>
                            <Stack direction="row" spacing={0.4} sx={{ alignItems: "center", color: "#94a3b8" }}>
                              <LockOutlinedIcon sx={{ fontSize: 14 }} />
                              <Typography variant="caption" sx={{ fontSize: "0.75rem", fontWeight: 600 }}>Default</Typography>
                            </Stack>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {!showAllDefault && (
              <Box sx={{ textAlign: "center", py: 1.5 }}>
                <Button
                  onClick={() => setShowAllDefault(true)}
                  endIcon={<ExpandMoreRoundedIcon sx={{ fontSize: 18 }} />}
                  sx={{ color: "#2563eb", textTransform: "none", fontWeight: 600, fontSize: "0.85rem" }}
                >
                  Show 23 more default mappings
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Disabled (flat list across custom + default) */}
        {activeTab === "disabled" && (
          <Box>
            {filteredDisabledRules.length === 0 ? (
              <Box sx={{ px: 3, py: 4 }}>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>No disabled rules match the current filters.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ borderBottom: "1px solid #e2e8f0" }}>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Rule</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Then assign to</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Matches</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem" }}>Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500, color: "#94a3b8", py: 1.25, fontSize: "0.8rem", pr: 3 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredDisabledRules.map((rule) => (
                      <TableRow key={rule.id} sx={{ "&:hover": { backgroundColor: "#f8fafc" }, "& td": { py: 1.5, borderBottom: "1px solid #f1f5f9" } }}>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                            <Avatar sx={{ width: 32, height: 32, bgcolor: rule.iconBg, color: rule.iconColor }}>{rule.icon}</Avatar>
                            <Box>
                              <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.85rem", lineHeight: 1.3 }}>{rule.name}</Typography>
                              <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.75rem" }}>{rule.description}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={rule.isCustom ? "Custom" : "Default"}
                            sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, bgcolor: "#f1f5f9", color: "#64748b" }}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <EastRoundedIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
                            <CategoryChip category={rule.category} />
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: "#334155", fontSize: "0.85rem" }}>{rule.matches.toLocaleString()}</TableCell>
                        <TableCell>
                          <Switch size="small" checked={rule.enabled} onChange={() => toggleRuleStatus(rule)} />
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 3 }}>
                          <IconButton size="small" sx={{ color: "#94a3b8" }} onClick={(event) => handleOpenRowMenu(event, rule.id)}>
                            <MoreHorizRoundedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Paper>

      {/* Footer callout */}
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
          px: 3,
          py: 2,
          borderRadius: 3,
          bgcolor: "#fff",
          borderColor: "#e2e8f0",
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Avatar sx={{ bgcolor: "#eff6ff", color: "#2563eb", width: 36, height: 36 }}>
            <LightbulbOutlinedIcon sx={{ fontSize: 18 }} />
          </Avatar>
          <Box>
            <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "0.9rem" }}>Want to create a rule faster?</Typography>
            <Typography variant="body2" sx={{ color: "#64748b", fontSize: "0.8rem" }}>
              Change a transaction category and we'll suggest creating a rule.
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="outlined"
          endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 16 }} />}
          sx={{
            borderColor: "#e2e8f0",
            color: "#334155",
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.85rem",
            borderRadius: 2,
            px: 1.75,
            "&:hover": { borderColor: "#cbd5e1", bgcolor: "#f8fafc" },
          }}
        >
          Go to Transactions
        </Button>
      </Paper>

      {/* Row action menu */}
      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu}>
        <MenuItem onClick={handleCloseRowMenu} sx={{ fontSize: "0.85rem" }}>Edit rule</MenuItem>
        <MenuItem onClick={handleCloseRowMenu} sx={{ fontSize: "0.85rem" }}>Duplicate</MenuItem>
        <MenuItem onClick={handleCloseRowMenu} sx={{ fontSize: "0.85rem", color: "error.main" }}>Delete</MenuItem>
      </Menu>
    </Stack>
  );
}