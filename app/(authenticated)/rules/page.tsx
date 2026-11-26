"use client";

import PageHeader from "@/components/PageHeader";
import { planRuleApplication } from "@/lib/categorization";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useCategories from "@/lib/hooks/useCategories";
import useRules, { type RuleDraft } from "@/lib/hooks/useRules";
import useTransactions from "@/lib/hooks/useTransactions";
import type { Account, Category, Rule } from "@/lib/types/types";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import EastRoundedIcon from "@mui/icons-material/EastRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import ApplyRuleDialog from "./ApplyRuleDialog";
import RuleDialog from "./RuleDialog";
import { describeActions, describeConditions } from "./ruleText";

export default function RulesPage() {
  const { user, authLoading } = useAuth();
  const { accounts = [] } = useAccounts(user, authLoading);
  const { categories = [] } = useCategories(user, authLoading);
  const { transactions, applyUpdates } = useTransactions(user, authLoading, accounts);
  const { rules, rulesLoading, rulesError, setRulesError, createRule, updateRule, setRuleEnabled, moveRule, deleteRule } =
    useRules(user, authLoading);

  const accountsById = useMemo(() => new Map<string, Account>(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map<string, Category>(categories.map((c) => [c.id, c])), [categories]);

  // Each opening gets a new key, so the dialogs start fresh.
  const [dialog, setDialog] = useState<{ key: number; open: boolean; rule: Rule | null }>({ key: 0, open: false, rule: null });
  const [applying, setApplying] = useState<{ key: number; open: boolean; rule: Rule | null }>({ key: 0, open: false, rule: null });
  const [menu, setMenu] = useState<{ anchor: HTMLElement; rule: Rule } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function openEditor(rule: Rule | null) {
    setDialog((prev) => ({ key: prev.key + 1, open: true, rule }));
  }

  function openApply(rule: Rule) {
    setApplying((prev) => ({ key: prev.key + 1, open: true, rule }));
  }

  async function handleSave(draft: RuleDraft): Promise<boolean> {
    if (dialog.rule) return updateRule(dialog.rule.id, draft);
    const id = await createRule(draft);
    if (!id) return false;
    const created: Rule = { id, enabled: true, priority: 0, ...draft };
    // Offer to apply a new rule to the transactions it already matches.
    if (planRuleApplication(created, transactions, categoriesById, false).updates.length > 0) openApply(created);
    return true;
  }

  async function handleApply(rule: Rule, includeUserPicks: boolean) {
    const { updates } = planRuleApplication(rule, transactions, categoriesById, includeUserPicks);
    const saved = await applyUpdates(updates);
    if (saved > 0) setNotice(`Updated ${saved} ${saved === 1 ? "transaction" : "transactions"}.`);
  }

  return (
    <Box sx={{ p: 4, bgcolor: "#f8fafc", minHeight: "100vh" }}>
      <PageHeader title="Rules" sx={{ mb: 2 }}>
        <Button
          variant="contained"
          disableElevation
          startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
          onClick={() => openEditor(null)}
          sx={{ bgcolor: "#2563eb", textTransform: "none", fontWeight: 600, fontSize: "0.85rem", borderRadius: 2, "&:hover": { bgcolor: "#1d4ed8" } }}
        >
          New rule
        </Button>
      </PageHeader>

      <Typography sx={{ color: "#64748b", fontSize: "0.9rem", mb: 3, maxWidth: 760 }}>
        Rules categorize, rename, or hide new transactions as they sync. They run top to bottom, and the first rule that
        matches applies. Categories you choose yourself are never changed unless you say so.
      </Typography>

      {rulesError && (
        <Alert severity="error" onClose={() => setRulesError(null)} sx={{ borderRadius: 3, mb: 2 }}>
          {rulesError}
        </Alert>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: "10px", mb: 2 }}>
        <Typography sx={{ fontWeight: 700, color: "#0f172a", fontSize: "1.15rem" }}>Your rules</Typography>
        <Chip size="small" label={rules.length} sx={{ height: 24, fontSize: "0.8rem", fontWeight: 600, bgcolor: "#f1f5f9", color: "#475569" }} />
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {rulesLoading ? (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, borderColor: "#e2e8f0", textAlign: "center" }}>
            <Typography sx={{ color: "#94a3b8", fontSize: "0.9rem" }}>Loading rules…</Typography>
          </Paper>
        ) : rules.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, borderColor: "#e2e8f0", textAlign: "center" }}>
            <Typography sx={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              No rules yet. Create one here, or categorize a transaction and choose Create rule.
            </Typography>
          </Paper>
        ) : (
          rules.map((rule, index) => (
            <Paper
              key={rule.id}
              variant="outlined"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                px: 2,
                py: 1.5,
                borderRadius: 3,
                borderColor: "#e2e8f0",
                opacity: rule.enabled ? 1 : 0.6,
                "&:hover": { borderColor: "#cbd5e1" },
              }}
            >
              <Tooltip title={rule.enabled ? "On" : "Off"}>
                <Switch size="small" checked={rule.enabled} onChange={(event) => setRuleEnabled(rule.id, event.target.checked)} />
              </Tooltip>
              <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 600, color: "#0f172a", fontSize: "0.9rem" }}>
                  {describeConditions(rule, accountsById)}
                </Typography>
                <EastRoundedIcon sx={{ fontSize: 16, color: "#cbd5e1" }} />
                <Typography sx={{ fontWeight: 600, color: "#2563eb", fontSize: "0.9rem" }}>
                  {describeActions(rule, categoriesById)}
                </Typography>
              </Box>
              <IconButton size="small" aria-label="Move up" disabled={index === 0} onClick={() => moveRule(rule.id, -1)}>
                <ArrowUpwardRoundedIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label="Move down"
                disabled={index === rules.length - 1}
                onClick={() => moveRule(rule.id, 1)}
              >
                <ArrowDownwardRoundedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label="Rule actions" onClick={(event) => setMenu({ anchor: event.currentTarget, rule })}>
                <MoreVertRoundedIcon fontSize="small" />
              </IconButton>
            </Paper>
          ))
        )}
      </Box>

      <Menu anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menu) openEditor(menu.rule);
            setMenu(null);
          }}
          sx={{ fontSize: "0.85rem" }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) openApply(menu.rule);
            setMenu(null);
          }}
          sx={{ fontSize: "0.85rem" }}
        >
          Apply to past transactions…
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) void deleteRule(menu.rule.id);
            setMenu(null);
          }}
          sx={{ fontSize: "0.85rem", color: "error.main" }}
        >
          Delete
        </MenuItem>
      </Menu>

      <RuleDialog
        key={dialog.key}
        open={dialog.open}
        rule={dialog.rule}
        categories={categories}
        accounts={accounts}
        transactions={transactions}
        onClose={() => setDialog((prev) => ({ ...prev, open: false }))}
        onSave={handleSave}
      />

      <ApplyRuleDialog
        key={`apply-${applying.key}`}
        open={applying.open}
        rule={applying.rule}
        summary={applying.rule ? `${describeConditions(applying.rule, accountsById)} → ${describeActions(applying.rule, categoriesById)}` : ""}
        transactions={transactions}
        categoriesById={categoriesById}
        onClose={() => setApplying((prev) => ({ ...prev, open: false }))}
        onApply={handleApply}
      />

      <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)} sx={{ borderRadius: 2.5 }}>
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}
