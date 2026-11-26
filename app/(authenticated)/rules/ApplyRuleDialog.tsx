"use client";

import { planRuleApplication } from "@/lib/categorization";
import type { Category, Rule, Transaction } from "@/lib/types/types";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
} from "@mui/material";
import { useMemo, useState } from "react";

type ApplyRuleDialogProps = {
  open: boolean;
  rule: Rule | null;
  /** How the rule reads, for the title. */
  summary: string;
  transactions: readonly Transaction[];
  categoriesById: ReadonlyMap<string, Category>;
  onClose: () => void;
  /** Saves the planned changes; resolves once they're written. */
  onApply: (rule: Rule, includeUserPicks: boolean) => Promise<void>;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Applies a rule to the loaded transactions (the last two years). Your own
 * category picks keep their category unless you include them.
 */
export default function ApplyRuleDialog({ open, rule, summary, transactions, categoriesById, onClose, onApply }: ApplyRuleDialogProps) {
  const [includeUserPicks, setIncludeUserPicks] = useState(false);
  const [applying, setApplying] = useState(false);

  const plan = useMemo(
    () => (rule ? planRuleApplication(rule, transactions, categoriesById, includeUserPicks) : null),
    [rule, transactions, categoriesById, includeUserPicks]
  );

  async function handleApply() {
    if (!rule) return;
    setApplying(true);
    await onApply(rule, includeUserPicks);
    setApplying(false);
    onClose();
  }

  const changes = plan?.updates.length ?? 0;

  return (
    <Dialog open={open} onClose={applying ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Apply to past transactions?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: "0.9rem", mb: 1.5 }}>
          <strong>{summary}</strong>
        </DialogContentText>
        <DialogContentText sx={{ fontSize: "0.9rem" }}>
          {plan ? plural(plan.matched, "transaction matches", "transactions match") : "No transactions match"}
          {plan && plan.matched > 0 ? `, and ${plural(changes, "would change", "would change")}.` : "."}
        </DialogContentText>
        {plan && plan.userPicks > 0 && rule?.actions.categoryId && (
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox checked={includeUserPicks} onChange={(event) => setIncludeUserPicks(event.target.checked)} />}
            label={`Also recategorize ${plural(plan.userPicks, "transaction", "transactions")} you categorized yourself`}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={applying}>
          Not now
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={applying || changes === 0}
        >
          {applying ? "Applying…" : `Apply to ${plural(changes, "transaction", "transactions")}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
