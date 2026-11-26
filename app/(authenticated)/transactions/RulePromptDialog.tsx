"use client";

import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel } from "@mui/material";
import { useState } from "react";

type RulePromptDialogProps = {
  open: boolean;
  merchantLabel: string;
  categoryLabel: string;
  /** Other loaded transactions from this merchant the rule would recategorize. */
  pastMatches: number;
  /** Of the matches, ones you categorized yourself (left alone unless included). */
  userPicks: number;
  onDismiss: () => void;
  onConfirm: (applyToPast: boolean, includeUserPicks: boolean) => void | Promise<void>;
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Shown after you categorize a transaction: offers a rule for its merchant,
 * and to apply it to past transactions. Give it a new key each time it opens.
 */
export default function RulePromptDialog({
  open,
  merchantLabel,
  categoryLabel,
  pastMatches,
  userPicks,
  onDismiss,
  onConfirm,
}: RulePromptDialogProps) {
  const [applyToPast, setApplyToPast] = useState(true);
  const [includeUserPicks, setIncludeUserPicks] = useState(false);
  const [saving, setSaving] = useState(false);

  const showInclude = userPicks > 0 && (pastMatches === 0 || applyToPast);

  async function handleConfirm() {
    setSaving(true);
    const include = showInclude && includeUserPicks;
    await onConfirm((pastMatches > 0 && applyToPast) || include, include);
    setSaving(false);
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onDismiss} maxWidth="xs" fullWidth>
      <DialogTitle>Always categorize this way?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: "0.9rem" }}>
          Create a rule: when the merchant is <strong>{merchantLabel}</strong>, set the category to{" "}
          <strong>{categoryLabel}</strong>.
        </DialogContentText>
        {pastMatches > 0 && (
          <FormControlLabel
            sx={{ mt: 1.5, display: "flex" }}
            control={<Checkbox checked={applyToPast} onChange={(event) => setApplyToPast(event.target.checked)} />}
            label={`Also apply it to ${plural(pastMatches, "past transaction", "past transactions")}`}
          />
        )}
        {showInclude && (
          <FormControlLabel
            sx={{ display: "flex", mt: pastMatches > 0 ? 0 : 1.5 }}
            control={<Checkbox checked={includeUserPicks} onChange={(event) => setIncludeUserPicks(event.target.checked)} />}
            label={`Also recategorize ${userPicks} you categorized yourself`}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onDismiss} disabled={saving}>
          Not now
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={saving}
        >
          {saving ? "Saving…" : "Create rule"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
