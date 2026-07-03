"use client";

import type { Cashflow, CashflowKind } from "@/lib/types/types";
import {
  Alert,
  Button,
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
} from "@mui/material";
import { useEffect, useState } from "react";

interface AddCashflowModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    kind: CashflowKind;
    estimatedMonthly: number;
  }) => Promise<void>;
  isSaving: boolean;
  editingCashflow: Cashflow | null;
  error?: string | null;
}

export default function AddCashflowModal({
  open,
  onClose,
  onSave,
  isSaving,
  editingCashflow,
  error,
}: AddCashflowModalProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CashflowKind>("expense");
  const [estimatedMonthly, setEstimatedMonthly] = useState("0");

  const isEditing = editingCashflow !== null;

  // Sync internal state whenever the modal opens or the target record changes
  useEffect(() => {
    if (open) {
      if (editingCashflow) {
        setName(editingCashflow.name);
        setKind(editingCashflow.kind);
        setEstimatedMonthly(String(editingCashflow.estimatedMonthly ?? 0));
      } else {
        setName("");
        setKind("expense");
        setEstimatedMonthly("0");
      }
    }
  }, [open, editingCashflow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedEstimatedMonthly = Number(estimatedMonthly || 0);

    await onSave({
      name: name.trim(),
      kind,
      estimatedMonthly: Number.isNaN(parsedEstimatedMonthly) ? 0 : parsedEstimatedMonthly,
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
        {isEditing ? "Edit Cashflow" : "Add Cashflow"}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            fullWidth
            size="small"
            label="Cashflow name"
            placeholder="e.g., Groceries"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            required
            sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}
          />

          <FormControl fullWidth size="small" sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}>
            <InputLabel id="cashflow-type-label">Type</InputLabel>
            <Select
              labelId="cashflow-type-label"
              label="Type"
              value={kind}
              onChange={(e) => setKind(e.target.value as CashflowKind)}
              disabled={isSaving}
            >
              <MenuItem value="income">Income</MenuItem>
              <MenuItem value="expense">Expense</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            size="small"
            label="Estimated monthly"
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
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Cashflow"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}