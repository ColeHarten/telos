"use client";

import CategoryPicker from "@/components/CategoryPicker";
import { CUSTOM_NAME_MAX, hasAction, hasCondition, ruleMatches, transactionInput } from "@/lib/categorization";
import type { RuleDraft } from "@/lib/hooks/useRules";
import type { Account, Category, Rule, Transaction } from "@/lib/types/types";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

type Direction = "any" | "in" | "out";

type Form = {
  merchantOp: "is" | "contains";
  merchant: string;
  description: string;
  accountIds: string[];
  amountMin: string;
  amountMax: string;
  direction: Direction;
  categoryId: string | null;
  rename: string;
  hide: boolean;
};

const EMPTY_FORM: Form = {
  merchantOp: "is",
  merchant: "",
  description: "",
  accountIds: [],
  amountMin: "",
  amountMax: "",
  direction: "any",
  categoryId: null,
  rename: "",
  hide: false,
};

function formFor(rule: Pick<Rule, "conditions" | "actions"> | null): Form {
  if (!rule) return EMPTY_FORM;
  const c = rule.conditions;
  return {
    merchantOp: c.merchant?.op ?? "is",
    merchant: c.merchant?.value ?? "",
    description: c.description ?? "",
    accountIds: c.accountIds,
    amountMin: c.amountMin === null ? "" : String(c.amountMin),
    amountMax: c.amountMax === null ? "" : String(c.amountMax),
    direction: c.direction ?? "any",
    categoryId: rule.actions.categoryId,
    rename: rule.actions.rename ?? "",
    hide: rule.actions.hide,
  };
}

function parseAmount(value: string): number | null | "invalid" {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}

/** The rule the form describes, or the reason it can't be saved. */
function toDraft(form: Form): { draft: RuleDraft } | { error: string } {
  const amountMin = parseAmount(form.amountMin);
  const amountMax = parseAmount(form.amountMax);
  if (amountMin === "invalid" || amountMax === "invalid") return { error: "Amounts must be zero or more." };
  if (amountMin !== null && amountMax !== null && amountMin > amountMax) {
    return { error: "The lowest amount is above the highest." };
  }
  const merchant = form.merchant.trim();
  const draft: RuleDraft = {
    conditions: {
      merchant: merchant ? { op: form.merchantOp, value: merchant } : null,
      description: form.description.trim() || null,
      accountIds: form.accountIds,
      amountMin,
      amountMax,
      direction: form.direction === "any" ? null : form.direction,
    },
    actions: {
      categoryId: form.categoryId,
      rename: form.rename.trim().slice(0, CUSTOM_NAME_MAX) || null,
      hide: form.hide,
    },
  };
  if (!hasCondition(draft.conditions)) return { error: "Add at least one condition." };
  if (!hasAction(draft.actions)) return { error: "Choose a category, a new name, or hiding." };
  return { draft };
}

type RuleDialogProps = {
  open: boolean;
  /** The rule to edit, or null for a new one. */
  rule: Rule | null;
  /** Starting values for a new rule, such as from selected transactions. */
  initial?: RuleDraft | null;
  categories: readonly Category[];
  accounts: readonly Account[];
  /** Loaded transactions, for the live match count. */
  transactions: readonly Transaction[];
  onClose: () => void;
  onSave: (draft: RuleDraft) => Promise<boolean>;
};

/** Give it a new key each time it opens, so the form starts fresh. */
export default function RuleDialog({ open, rule, initial, categories, accounts, transactions, onClose, onSave }: RuleDialogProps) {
  const [form, setForm] = useState<Form>(() => formFor(rule ?? initial ?? null));
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const result = useMemo(() => toDraft(form), [form]);
  const matchCount = useMemo(() => {
    if (!("draft" in result)) return null;
    const { conditions } = result.draft;
    return transactions.filter((tx) => ruleMatches(conditions, transactionInput(tx))).length;
  }, [result, transactions]);

  const accountOptions = useMemo(
    () => accounts.filter((account) => !account.isArchived || form.accountIds.includes(account.id)),
    [accounts, form.accountIds]
  );
  const selectedAccounts = accountOptions.filter((account) => form.accountIds.includes(account.id));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!("draft" in result)) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    const saved = await onSave(result.draft);
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{rule ? "Edit rule" : "New rule"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 0.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a" }}>If a transaction matches all of these</Typography>

          <Stack direction="row" spacing={1}>
            <Select
              size="small"
              value={form.merchantOp}
              onChange={(event) => set("merchantOp", event.target.value === "contains" ? "contains" : "is")}
              sx={{ minWidth: 190 }}
            >
              <MenuItem value="is">Merchant is</MenuItem>
              <MenuItem value="contains">Merchant contains</MenuItem>
            </Select>
            <TextField
              size="small"
              fullWidth
              placeholder="e.g., Starbucks"
              value={form.merchant}
              onChange={(event) => set("merchant", event.target.value)}
            />
          </Stack>

          <TextField
            size="small"
            label="Description contains"
            placeholder="Text from the bank's description"
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />

          <Autocomplete
            multiple
            size="small"
            options={accountOptions}
            value={selectedAccounts}
            onChange={(_, next) => set("accountIds", next.map((account) => account.id))}
            getOptionLabel={(account) => (account.plaidMask ? `${account.name} ••${account.plaidMask}` : account.name)}
            isOptionEqualToValue={(option, current) => option.id === current.id}
            renderInput={(params) => <TextField {...params} label="Accounts" placeholder={form.accountIds.length ? "" : "Any account"} />}
          />

          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              type="number"
              label="Amount from"
              value={form.amountMin}
              onChange={(event) => set("amountMin", event.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }, htmlInput: { min: 0, step: "0.01" } }}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="to"
              value={form.amountMax}
              onChange={(event) => set("amountMax", event.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }, htmlInput: { min: 0, step: "0.01" } }}
              fullWidth
            />
            <Select
              size="small"
              value={form.direction}
              onChange={(event) => {
                const value = event.target.value;
                set("direction", value === "in" || value === "out" ? value : "any");
              }}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="any">In or out</MenuItem>
              <MenuItem value="out">Money out</MenuItem>
              <MenuItem value="in">Money in</MenuItem>
            </Select>
          </Stack>

          <Typography sx={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a", pt: 1 }}>Then</Typography>

          <CategoryPicker
            categories={categories}
            value={form.categoryId}
            onChange={(categoryId) => set("categoryId", categoryId)}
            label="Set category"
            placeholder="Leave the category alone"
          />

          <TextField
            size="small"
            label="Rename to"
            placeholder="Leave the name alone"
            value={form.rename}
            onChange={(event) => set("rename", event.target.value)}
            slotProps={{ htmlInput: { maxLength: CUSTOM_NAME_MAX } }}
          />

          <FormControlLabel
            control={<Switch checked={form.hide} onChange={(event) => set("hide", event.target.checked)} />}
            label="Hide from budgets and cash flow"
          />

          {showErrors && "error" in result ? (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {result.error}
            </Alert>
          ) : (
            matchCount !== null && (
              <Typography sx={{ color: "#64748b", fontSize: "0.85rem" }}>
                Matches {matchCount} loaded {matchCount === 1 ? "transaction" : "transactions"}. Saving changes only new
                transactions; you can apply it to past ones next.
              </Typography>
            )
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none", fontWeight: 600 }}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disableElevation
          disabled={saving}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
        >
          {saving ? "Saving…" : rule ? "Save rule" : "Create rule"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
