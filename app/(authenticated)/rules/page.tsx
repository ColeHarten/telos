"use client";

import EmptyState from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
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
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import EastRoundedIcon from "@mui/icons-material/EastRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
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
    <Stack spacing={3}>
      <PageHeader
        title="Rules"
        description="Rules categorize, rename, or hide new transactions as they sync. They run top to bottom, and the first rule that matches applies. Categories you choose yourself are never changed unless you say so."
      >
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openEditor(null)} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
          New rule
        </Button>
      </PageHeader>

      {rulesError && (
        <Alert severity="error" onClose={() => setRulesError(null)}>
          {rulesError}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        {rulesLoading ? (
          <ListSkeleton rows={3} />
        ) : rules.length === 0 ? (
          <EmptyState
            icon={<BoltOutlinedIcon />}
            title="No rules yet"
            description="Create one here, or categorize a transaction and choose Create rule."
            action={
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openEditor(null)}>
                New rule
              </Button>
            }
          />
        ) : (
          rules.map((rule, index) => (
            <Box
              key={rule.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, sm: 2 },
                px: 2,
                py: 1.5,
                borderTop: index === 0 ? "none" : "1px solid",
                borderColor: "divider",
                "&:hover": { bgcolor: "grey.50" },
              }}
            >
              <Tooltip title={rule.enabled ? "On" : "Off"}>
                <Switch size="small" checked={rule.enabled} onChange={(event) => setRuleEnabled(rule.id, event.target.checked)} />
              </Tooltip>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  columnGap: 1.5,
                  rowGap: 0.25,
                  flexWrap: "wrap",
                  opacity: rule.enabled ? 1 : 0.55,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {describeConditions(rule, accountsById)}
                </Typography>
                <EastRoundedIcon sx={{ fontSize: 16, color: "grey.300" }} />
                <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>
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
            </Box>
          ))
        )}
      </Paper>

      <Menu anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menu) openEditor(menu.rule);
            setMenu(null);
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) openApply(menu.rule);
            setMenu(null);
          }}
        >
          Apply to past transactions…
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) void deleteRule(menu.rule.id);
            setMenu(null);
          }}
          sx={{ color: "error.main" }}
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

      <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)}>
        <Alert severity="success" variant="filled" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
