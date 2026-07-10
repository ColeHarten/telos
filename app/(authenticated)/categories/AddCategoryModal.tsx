"use client";

import type { Account, Category, CategoryKind } from "@/lib/types/types";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

const KIND_OPTIONS: { value: CategoryKind; label: string; color: string }[] = [
  { value: "income", label: "Income", color: "#059669" },
  { value: "expense", label: "Expense", color: "#dc2626" },
  { value: "transfer", label: "Transfer", color: "#2563eb" },
];

function KindDot({ color }: { color: string }) {
  return <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />;
}

interface AddCategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    kind: CategoryKind;
    estimatedMonthly: number;
    description: string;
    keywords: string[];
    transferAccountId: string | null;
  }) => Promise<void>;
  isSaving: boolean;
  editingCategory: Category | null;
  accounts: Account[];
  error?: string | null;
}

export default function AddCategoryModal({
  open,
  onClose,
  onSave,
  isSaving,
  editingCategory,
  accounts,
  error,
}: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [estimatedMonthly, setEstimatedMonthly] = useState("0");
  const [description, setDescription] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [transferAccountId, setTransferAccountId] = useState("");
  const [destinationError, setDestinationError] = useState<string | null>(null);

  const isEditing = editingCategory !== null;
  const activeAccounts = accounts.filter((a) => !a.isArchived);

  // Sync internal state whenever the modal opens or the target record changes
  useEffect(() => {
    if (open) {
      if (editingCategory) {
        setName(editingCategory.name);
        setKind(editingCategory.kind);
        setEstimatedMonthly(String(editingCategory.estimatedMonthly ?? 0));
        setDescription(editingCategory.description ?? "");
        setKeywords(editingCategory.keywords ?? []);
        setTransferAccountId(editingCategory.transferAccountId ?? "");
      } else {
        setName("");
        setKind("expense");
        setEstimatedMonthly("0");
        setDescription("");
        setKeywords([]);
        setTransferAccountId("");
      }
      setKeywordInput("");
      setDestinationError(null);
    }
  }, [open, editingCategory]);

  const commitKeywordInput = () => {
    const trimmed = keywordInput.trim().toLowerCase();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed]);
    }
    setKeywordInput("");
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitKeywordInput();
    } else if (e.key === "Backspace" && keywordInput === "" && keywords.length > 0) {
      setKeywords((prev) => prev.slice(0, -1));
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (kind === "transfer" && !transferAccountId) {
      setDestinationError("Choose a destination account for this transfer.");
      return;
    }
    setDestinationError(null);

    const parsedEstimatedMonthly = Number(estimatedMonthly || 0);

    // Catch any keyword left in the input box that the user didn't press Enter/comma for
    const trimmedPending = keywordInput.trim().toLowerCase();
    const finalKeywords =
      trimmedPending && !keywords.includes(trimmedPending)
        ? [...keywords, trimmedPending]
        : keywords;

    await onSave({
      name: name.trim(),
      kind,
      estimatedMonthly: Number.isNaN(parsedEstimatedMonthly) ? 0 : parsedEstimatedMonthly,
      description: description.trim(),
      keywords: finalKeywords,
      transferAccountId: kind === "transfer" ? transferAccountId : null,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason !== "backdropClick" && !isSaving) onClose();
      }}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          component: "form",
          onSubmit: handleSubmit,
          sx: { borderRadius: 3 },
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, pt: 2.5 }}>
        {isEditing ? "Edit Category" : "Add Category"}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              fullWidth
              size="small"
              label="Category name"
              placeholder={kind === "transfer" ? "e.g., Transfer to Brokerage" : "e.g., Groceries"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              required
              sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}
            />

            <FormControl fullWidth size="small" sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}>
              <InputLabel id="category-type-label">Type</InputLabel>
              <Select
                labelId="category-type-label"
                label="Type"
                value={kind}
                onChange={(e) => setKind(e.target.value as CategoryKind)}
                disabled={isSaving}
                renderValue={(value) => {
                  const opt = KIND_OPTIONS.find((o) => o.value === value)!;
                  return (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <KindDot color={opt.color} />
                      {opt.label}
                    </Box>
                  );
                }}
              >
                {KIND_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ display: "flex", gap: 1 }}>
                    <KindDot color={opt.color} />
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {kind === "transfer" && (
            <Box>
              <Autocomplete
                size="small"
                options={activeAccounts}
                getOptionLabel={(option) => option.name}
                value={activeAccounts.find((a) => a.id === transferAccountId) ?? null}
                onChange={(_, newValue) => {
                  setTransferAccountId(newValue ? newValue.id : "");
                  setDestinationError(null);
                }}
                disabled={isSaving}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Destination account"
                    required
                    error={Boolean(destinationError)}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                )}
              />
              {destinationError ? (
                <Typography variant="caption" sx={{ color: "error.main", mt: 0.5, display: "block" }}>
                  {destinationError}
                </Typography>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  Where this transfer's money ends up.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            size="small"
            label={kind === "transfer" ? "Estimated monthly transfer" : "Estimated monthly"}
            type="number"
            value={estimatedMonthly}
            onChange={(e) => setEstimatedMonthly(e.target.value)}
            disabled={isSaving}
            slotProps={{
              htmlInput: { min: 0, step: 0.01 },
              input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
            }}
            sx={{
              "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 },
              "& input": { textAlign: "right" },
            }}
          />

          <TextField
            fullWidth
            size="small"
            label="Description"
            placeholder="e.g., Daily coffee purchases"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSaving}
            multiline
            minRows={2}
            helperText="Optional — helps auto-categorize future transactions"
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />

          <TextField
            fullWidth
            size="small"
            label="Keywords"
            placeholder="e.g., starbucks, peets, cafe (press Enter to add)"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            onBlur={commitKeywordInput}
            disabled={isSaving}
            helperText="Optional — merchant names or terms to match against"
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            slotProps={{
              input: keywords.length
                ? {
                    startAdornment: (
                      <Stack sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 0.5, mr: 0.5 }}>
                        {keywords.map((kw) => (
                          <Chip
                            key={kw}
                            label={kw}
                            size="small"
                            onDelete={isSaving ? undefined : () => removeKeyword(kw)}
                          />
                        ))}
                      </Stack>
                    ),
                  }
                : undefined,
            }}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
        <Button onClick={onClose} disabled={isSaving} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isSaving}
          sx={{ height: 36, borderRadius: 2, textTransform: "none", fontWeight: 700, px: 3 }}
        >
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Category"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}