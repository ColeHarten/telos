"use client";

import { formatTransactionAmount } from "@/lib/utils";
import CategoryPicker from "@/components/CategoryPicker";
import MerchantAvatar from "@/components/MerchantAvatar";
import { CUSTOM_NAME_MAX, NOTES_MAX, type TransactionChanges } from "@/lib/categorization";
import { plaidCategoryLabel } from "@/lib/plaidCategories";
import type { Account, Category, Rule, Transaction } from "@/lib/types/types";
import BoltIcon from "@mui/icons-material/Bolt";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type ReactNode } from "react";
import { describeActions, describeConditions } from "../rules/ruleText";
import { categoryNote } from "./categoryNote";

type TransactionDrawerProps = {
  transaction: Transaction | null;
  categories: readonly Category[];
  rules: readonly Rule[];
  accountsById: ReadonlyMap<string, Account>;
  categoriesById: ReadonlyMap<string, Category>;
  onClose: () => void;
  /** Your category pick; "" clears it. */
  onCategoryChange: (tx: Transaction, categoryId: string) => void;
  onAcceptSuggestion: (tx: Transaction) => void;
  /** Saves a rename, notes, or hiding. Resolves to whether it saved. */
  onSave: (tx: Transaction, changes: TransactionChanges) => Promise<boolean>;
  onCreateRule: (tx: Transaction) => void;
};

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.75 }}>
      <Typography variant="body2" sx={{ color: "text.secondary", flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * A transaction's details: category and why it has it, your name for it,
 * notes, hiding, and what the bank and Plaid sent.
 */
export default function TransactionDrawer(props: TransactionDrawerProps) {
  const { transaction, onClose } = props;
  return (
    <Drawer
      anchor="right"
      open={transaction !== null}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 420 }, bgcolor: "background.paper" } } }}
    >
      {/* A new key per transaction, so the name and notes fields start from its saved values. */}
      {transaction && <DrawerBody key={transaction.id} {...props} transaction={transaction} />}
    </Drawer>
  );
}

function DrawerBody({
  transaction: tx,
  categories,
  rules,
  accountsById,
  categoriesById,
  onClose,
  onCategoryChange,
  onAcceptSuggestion,
  onSave,
  onCreateRule,
}: TransactionDrawerProps & { transaction: Transaction }) {
  const [name, setName] = useState(tx.customName ?? "");
  const [notes, setNotes] = useState(tx.notes ?? "");

  const bankName = tx.merchantName || tx.rawName || tx.displayName;
  const suggestion = !tx.categoryId && tx.suggestedCategoryId ? categoriesById.get(tx.suggestedCategoryId) : undefined;
  const rule = tx.ruleId ? rules.find((candidate) => candidate.id === tx.ruleId) : undefined;
  const note = categoryNote(tx);
  const plaidLabel = plaidCategoryLabel(tx.plaidCategoryDetailed ?? tx.plaidCategoryPrimary);
  const description = tx.originalDescription ?? tx.rawName ?? "";

  // Saved on blur, and on Escape, which closes the drawer without a blur.
  function saveName() {
    const next = name.trim().slice(0, CUSTOM_NAME_MAX) || null;
    if (next !== (tx.customName ?? null)) void onSave(tx, { customName: next });
  }

  function saveNotes() {
    const next = notes.trim().slice(0, NOTES_MAX) || null;
    if (next !== (tx.notes ?? null)) void onSave(tx, { notes: next });
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, p: 3, pb: 2 }}>
        <MerchantAvatar name={tx.displayName} logoUrl={tx.logoUrl} size={44} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, color: "text.primary", fontSize: "1.05rem", lineHeight: 1.3, wordBreak: "break-word" }}>
            {tx.displayName}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {formatDate(tx.date)} · {tx.originAccName}
          </Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ color: "grey.400" }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Typography sx={{ px: 3, fontWeight: 700, fontSize: "1.6rem", letterSpacing: "-0.02em", color: tx.amount > 0 ? "text.primary" : "success.main" }}>
        {formatTransactionAmount(tx.amount)}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ px: 3, mt: 1 }}>
        <Chip
          size="small"
          label={tx.pending ? "Pending" : "Posted"}
          sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, borderRadius: 1.5, bgcolor: tx.pending ? "#fffbeb" : "#f0fdf4", color: tx.pending ? "#d97706" : "#16a34a" }}
        />
        {tx.hidden && (
          <Chip size="small" label="Hidden" sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600, borderRadius: 1.5, bgcolor: "grey.100", color: "grey.600" }} />
        )}
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
        <Stack spacing={2.5}>
          <Box>
            <CategoryPicker
              categories={categories}
              value={tx.categoryId ?? null}
              onChange={(categoryId) => onCategoryChange(tx, categoryId ?? "")}
              label="Category"
              placeholder="Needs review"
              exclude={(category) => category.kind === "transfer" && category.transferAccountId === tx.originAccId}
            />
            {suggestion && (
              <Chip
                size="small"
                icon={<CheckRoundedIcon sx={{ fontSize: 14 }} />}
                label={`Accept suggestion: ${suggestion.name}`}
                onClick={() => onAcceptSuggestion(tx)}
                sx={{ mt: 1, height: 24, fontSize: "0.75rem", fontWeight: 600, bgcolor: "#eff6ff", color: "primary.main", borderRadius: 1.5 }}
              />
            )}
            <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
              {note ?? (tx.categoryId ? "You chose this category." : "Waiting for a category.")}
              {rule && ` ${describeConditions(rule, accountsById)} → ${describeActions(rule, categoriesById)}.`}
            </Typography>
          </Box>

          <TextField
            label="Name"
            size="small"
            value={name}
            placeholder={bankName}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Escape") saveName();
            }}
            helperText="Shown instead of the bank's name. Leave empty to use it."
            slotProps={{ htmlInput: { maxLength: CUSTOM_NAME_MAX } }}
            fullWidth
          />

          <TextField
            label="Notes"
            size="small"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={saveNotes}
            onKeyDown={(event) => {
              if (event.key === "Escape") saveNotes();
            }}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: NOTES_MAX } }}
            fullWidth
          />

          <FormControlLabel
            control={<Switch checked={Boolean(tx.hidden)} onChange={(event) => void onSave(tx, { hidden: event.target.checked })} />}
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                  Hide from budgets
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Left out of budgets, cash flow, and Needs review.
                </Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", ml: 0, gap: 1, "& .MuiSwitch-root": { mt: -0.5 } }}
          />

          <Divider />

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary", mb: 0.5 }}>
              From the bank
            </Typography>
            <Detail label="Account">{tx.originAccName}</Detail>
            <Detail label="Posted">{formatDate(tx.date)}</Detail>
            {tx.authorizedDate && tx.authorizedDate !== tx.date && <Detail label="Authorized">{formatDate(tx.authorizedDate)}</Detail>}
            {tx.merchantName && <Detail label="Merchant">{tx.merchantName}</Detail>}
            {description && <Detail label="Description">{description}</Detail>}
            <Detail label="Bank category">
              {plaidLabel || "None"}
              {tx.plaidConfidence ? ` (${tx.plaidConfidence.toLowerCase().replace(/_/g, " ")})` : ""}
            </Detail>
            {tx.website && <Detail label="Website">{tx.website}</Detail>}
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: 2.5, borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 1 }}>
        <Button
          startIcon={<BoltIcon sx={{ fontSize: 18 }} />}
          onClick={() => onCreateRule(tx)}
        >
          Create rule
        </Button>
        <Button onClick={onClose} variant="outlined">
          Done
        </Button>
      </Box>
    </Box>
  );
}
