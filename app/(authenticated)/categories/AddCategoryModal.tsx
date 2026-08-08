"use client";

import type {
  Account,
  Category,
  CategoryKind,
  Deduction,
  DeductionType,
  PayFrequency,
  PaycheckDetails,
} from "@/lib/types/types";
import { calculateWithholdings, payFrequencyOptions } from "@/lib/paycheck/paycheck";
import { formatCurrency } from "@/lib/utils";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

const KIND_OPTIONS: { value: CategoryKind; label: string; color: string }[] = [
  { value: "income", label: "Income", color: "#059669" },
  { value: "expense", label: "Expense", color: "#dc2626" },
  { value: "transfer", label: "Transfer", color: "#2563eb" },
];

// Logical order: money leaves gross pay pre-tax first, then taxes are withheld,
// then whatever's left has post-tax deductions taken out.
const DEDUCTION_TYPE_ORDER: DeductionType[] = ["preTaxDeduction", "tax", "postTaxDeduction"];

const DEDUCTION_TYPE_META: Record<DeductionType, { label: string; color: string; background: string }> = {
  preTaxDeduction: { label: "Pre-tax", color: "#7c3aed", background: "#f5f3ff" },
  tax: { label: "Tax", color: "#475569", background: "#f1f5f9" },
  postTaxDeduction: { label: "Post-tax", color: "#c2410c", background: "#fff7ed" },
};

const QUICK_ADD_OPTIONS: Record<DeductionType, { label: string; defaultPercent: number }[]> = {
  preTaxDeduction: [
    { label: "401(k) Contribution", defaultPercent: 5 },
    { label: "Health Insurance", defaultPercent: 3 },
    { label: "HSA Contribution", defaultPercent: 2 },
  ],
  tax: [
    { label: "Federal Income Tax", defaultPercent: 12 },
    { label: "State Income Tax", defaultPercent: 5 },
    { label: "Social Security (FICA)", defaultPercent: 6.2 },
    { label: "Medicare (FICA)", defaultPercent: 1.45 },
  ],
  postTaxDeduction: [
    { label: "Roth 401(k)", defaultPercent: 5 },
    { label: "Union Dues", defaultPercent: 0 },
  ],
};

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
    transferAccountId: string | null;
    paycheckDetails: PaycheckDetails | null;
    deductionBreakdown: { deductionId: string; linkedAccountId: string; monthlyAmount: number }[];
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
  const [transferAccountId, setTransferAccountId] = useState("");
  const [destinationError, setDestinationError] = useState<string | null>(null);

  // --- Paycheck fields (only relevant when kind === "income") ---
  const [usePaycheckProfile, setUsePaycheckProfile] = useState(false);
  const [payFrequency, setPayFrequency] = useState<PayFrequency>("biweekly");
  const [grossSalary, setGrossSalary] = useState("0");
  const [deductions, setDeductions] = useState<Deduction[]>([]);

  const isEditing = editingCategory !== null;
  const activeAccounts = accounts.filter((a) => !a.isArchived);

  // Accounts selectable as a deduction's contribution destination.
  const contributionEligibleAccounts = useMemo(
    () => accounts.filter((a) => a.isContributionEligible && !a.isArchived),
    [accounts]
  );

  // Enforces the 1:1 rule (each account linked from at most one deduction
  // row) at the UI level, by excluding already-linked accounts from every
  // other row's option list.
  const linkedAccountIds = useMemo(
    () => new Set(deductions.map((d) => d.linkedAccountId).filter((id): id is string => Boolean(id))),
    [deductions]
  );

  // This category is a transfer category that was auto-created from a
  // paycheck deduction link — its amount is system-managed, not editable
  // here (see the "UI-locked" decision in the roadmap doc).
  const isAutoLinkedTransfer = kind === "transfer" && Boolean(editingCategory?.sourceDeductionId);

  useEffect(() => {
    if (!open) return;

    if (editingCategory) {
      setName(editingCategory.name);
      setKind(editingCategory.kind);
      setEstimatedMonthly(String(editingCategory.estimatedMonthly ?? 0));
      setDescription(editingCategory.description ?? "");
      setTransferAccountId(editingCategory.transferAccountId ?? "");

      if (editingCategory.paycheckDetails) {
        setUsePaycheckProfile(true);
        setPayFrequency(editingCategory.paycheckDetails.payFrequency);
        setGrossSalary(String(editingCategory.paycheckDetails.grossSalary));
        // Backfill id/linkedAccountId for deductions saved before this
        // feature existed — without an id, the reconciliation logic has no
        // stable key and would treat every row as new on the next save.
        setDeductions(
          editingCategory.paycheckDetails.deductions.map((d) => ({
            ...d,
            id: d.id ?? crypto.randomUUID(),
            linkedAccountId: d.linkedAccountId ?? null,
          }))
        );
      } else {
        setUsePaycheckProfile(false);
        setPayFrequency("biweekly");
        setGrossSalary("0");
        setDeductions([]);
      }
    } else {
      setName("");
      setKind("expense");
      setEstimatedMonthly("0");
      setDescription("");
      setTransferAccountId("");
      setUsePaycheckProfile(false);
      setPayFrequency("biweekly");
      setGrossSalary("0");
      setDeductions([]);
    }
    setDestinationError(null);
  }, [open, editingCategory]);

  const calculatedValues = useMemo(
    () => calculateWithholdings(Number(grossSalary) || 0, deductions, payFrequency),
    [grossSalary, deductions, payFrequency]
  );

  const frequencyShortLabel = payFrequencyOptions.find((o) => o.value === payFrequency)?.shortLabel ?? "";

  function addDeductionRow(type: DeductionType, label = "", defaultPercent = 0) {
    setDeductions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label, value: defaultPercent, kind: "percentOfGross", type, linkedAccountId: null },
    ]);
  }

  function updateDeductionRow(index: number, changes: Partial<Deduction>) {
    setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, ...changes } : d)));
  }

  function removeDeductionRow(index: number) {
    setDeductions((prev) => prev.filter((_, i) => i !== index));
  }

  const groupedIndexed = useMemo(() => {
    const withIndex = deductions.map((d, i) => ({ ...d, index: i }));
    return {
      preTaxDeduction: withIndex.filter((d) => d.type === "preTaxDeduction"),
      tax: withIndex.filter((d) => d.type === "tax"),
      postTaxDeduction: withIndex.filter((d) => d.type === "postTaxDeduction"),
    };
  }, [deductions]);

  function renderDeductionRow(row: Deduction & { index: number }) {
    const showAccountLink = row.type !== "tax";
    const linkedAccount = row.linkedAccountId
      ? contributionEligibleAccounts.find((a) => a.id === row.linkedAccountId) ?? null
      : null;
    const availableAccountsForRow = contributionEligibleAccounts.filter(
      (a) => a.id === row.linkedAccountId || !linkedAccountIds.has(a.id)
    );

    return (
      <Box key={row.id} sx={{ px: 2, py: 1 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 150px 130px 40px", alignItems: "center", gap: 1 }}>
          <TextField
            placeholder={row.type === "tax" ? "e.g., Federal Income Tax" : "e.g., 401k Contribution"}
            size="small"
            value={row.label}
            onChange={(e) => updateDeductionRow(row.index, { label: e.target.value })}
            variant="standard"
            slotProps={{ input: { disableUnderline: true } }}
          />
          <Select
            size="small"
            variant="standard"
            value={row.kind}
            onChange={(e) => updateDeductionRow(row.index, { kind: e.target.value as Deduction["kind"] })}
            disableUnderline
          >
            <MenuItem value="percentOfGross">% of Gross</MenuItem>
            <MenuItem value="flatAmount">Flat Amount</MenuItem>
          </Select>
          <TextField
            size="small"
            type="number"
            variant="standard"
            value={row.value}
            onChange={(e) => updateDeductionRow(row.index, { value: Number(e.target.value) || 0 })}
            slotProps={{
              input: {
                disableUnderline: true,
                endAdornment: <InputAdornment position="end">{row.kind === "percentOfGross" ? "%" : "$"}</InputAdornment>,
              },
            }}
          />
          <Tooltip title="Delete Item">
            <IconButton onClick={() => removeDeductionRow(row.index)} size="small">
              <DeleteRoundedIcon sx={{ color: "#dc2626", fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {showAccountLink && contributionEligibleAccounts.length > 0 && (
          <Autocomplete
            size="small"
            options={availableAccountsForRow}
            getOptionLabel={(option) => option.name}
            value={linkedAccount}
            onChange={(_, newValue) => updateDeductionRow(row.index, { linkedAccountId: newValue ? newValue.id : null })}
            disabled={isSaving}
            renderInput={(params) => (
              <TextField
                {...params}
                variant="standard"
                placeholder="Link to a tracked account (optional)"
                sx={{
                  "& .MuiInput-root:before": { borderBottom: "none" },
                  "& .MuiInput-root:after": { borderBottom: "none" },
                  "& .MuiInput-root:hover:not(.Mui-disabled):before": { borderBottom: "none" },
                }}
              />
            )}
            sx={{ maxWidth: 340, mt: 0.25 }}
          />
        )}
      </Box>
    );
  }

  function renderDeductionSection(type: DeductionType) {
    const meta = DEDUCTION_TYPE_META[type];
    const rows = groupedIndexed[type];
    const quickAdds = QUICK_ADD_OPTIONS[type];

    return (
      <Box key={type}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 0.75, bgcolor: meta.background }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: meta.color, letterSpacing: 0.3 }}>
            {meta.label.toUpperCase()}
          </Typography>
          <Button
            onClick={() => addDeductionRow(type)}
            size="small"
            startIcon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
            disabled={isSaving}
            sx={{ textTransform: "none", fontWeight: 700, fontSize: "0.7rem", minWidth: 0, py: 0, color: meta.color }}
          >
            Add
          </Button>
        </Box>

        <Stack sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 1, px: 2, py: 1.25 }}>
          {quickAdds.map((option) => {
            const alreadyAdded = deductions.some((d) => d.label === option.label);
            return (
              <Chip
                key={option.label}
                size="small"
                icon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
                label={option.label}
                onClick={() => !alreadyAdded && addDeductionRow(type, option.label, option.defaultPercent)}
                disabled={alreadyAdded || isSaving}
                sx={{ borderRadius: 999, bgcolor: "#f1f5f9", color: "#475569", fontWeight: 600 }}
              />
            );
          })}
        </Stack>

        {rows.length > 0 && (
          <Stack divider={<Divider />} sx={{ borderTop: "1px solid", borderColor: "divider" }}>
            {rows.map(renderDeductionRow)}
          </Stack>
        )}
      </Box>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (kind === "transfer" && !transferAccountId) {
      setDestinationError("Choose a destination account for this transfer.");
      return;
    }
    setDestinationError(null);

    const isPaycheckSynced = kind === "income" && usePaycheckProfile;

    let paycheckDetails: PaycheckDetails | null = null;
    let finalEstimatedMonthly: number;
    let deductionBreakdown: { deductionId: string; linkedAccountId: string; monthlyAmount: number }[] = [];

    if (isPaycheckSynced) {
      const cleanedDeductions = deductions
        .filter((d) => d.label.trim().length > 0)
        .map((d) => ({
          id: d.id,
          label: d.label.trim(),
          value: d.value,
          kind: d.kind,
          type: d.type,
          // Defensive: a "tax" row should never carry a link even though the
          // UI never offers the picker for it.
          linkedAccountId: d.type === "tax" ? null : d.linkedAccountId ?? null,
        }));
      const calculated = calculateWithholdings(Number(grossSalary) || 0, cleanedDeductions, payFrequency);

      paycheckDetails = {
        payFrequency,
        grossSalary: Number(grossSalary) || 0,
        deductions: cleanedDeductions,
      };
      finalEstimatedMonthly = calculated.estimatedMonthlyNet;
      deductionBreakdown = calculated.deductionBreakdown;
    } else if (isAutoLinkedTransfer && editingCategory) {
      // System-managed amount — never overwrite it from this form.
      finalEstimatedMonthly = editingCategory.estimatedMonthly;
    } else {
      const parsed = Number(estimatedMonthly || 0);
      finalEstimatedMonthly = Number.isNaN(parsed) ? 0 : parsed;
    }

    await onSave({
      name: name.trim(),
      kind,
      estimatedMonthly: finalEstimatedMonthly,
      description: description.trim(),
      transferAccountId: kind === "transfer" ? transferAccountId : null,
      paycheckDetails,
      deductionBreakdown,
    });
  };

  const showPaycheckCard = kind === "income" && usePaycheckProfile;

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason !== "backdropClick" && !isSaving) onClose();
      }}
      fullWidth
      maxWidth={showPaycheckCard ? "md" : "sm"}
      slotProps={{
        paper: { component: "form", onSubmit: handleSubmit, sx: { borderRadius: 3 } },
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, pt: 2.5 }}>
        {isEditing ? "Edit Category" : "Add Category"}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {isAutoLinkedTransfer && (
            <Alert severity="info" icon={<LockRoundedIcon fontSize="small" />}>
              This transfer is managed by a paycheck deduction. Its amount and destination update automatically —
              edit the deduction on the linked income category to change them.
            </Alert>
          )}

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
                disabled={isSaving || isAutoLinkedTransfer}
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
                disabled={isSaving || isAutoLinkedTransfer}
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
              <Typography
                variant="caption"
                color={destinationError ? "error.main" : "text.secondary"}
                sx={{ mt: 0.5, display: "block" }}
              >
                {destinationError ?? "Where this transfer's money ends up."}
              </Typography>
            </Box>
          )}

          {kind === "income" && (
            <FormControlLabel
              control={
                <Switch checked={usePaycheckProfile} onChange={(e) => setUsePaycheckProfile(e.target.checked)} disabled={isSaving} />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Add withholdings and deductions
                </Typography>
              }
              sx={{ ml: 0, "& .MuiFormControlLabel-label": { mt: 0.25 } }}
            />
          )}

          {showPaycheckCard && (
            <Card sx={{ bgcolor: "#f8fafc", border: "1px solid", borderColor: "divider", borderRadius: 2 }} elevation={0}>
              <CardContent sx={{ p: 2 }}>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Pay Frequency</InputLabel>
                      <Select
                        onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}
                        value={payFrequency}
                        label="Pay Frequency"
                        disabled={isSaving}
                      >
                        {payFrequencyOptions.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Gross pay (per paycheck)"
                      onChange={(e) => setGrossSalary(e.target.value)}
                      size="small"
                      type="number"
                      value={grossSalary}
                      disabled={isSaving}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
                    />
                  </Grid>
                </Grid>

                <Typography variant="body2" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>
                  Deductions
                </Typography>

                <Card sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden", mb: 2 }} elevation={0}>
                  {DEDUCTION_TYPE_ORDER.map((type, i) => (
                    <Box key={type}>
                      {i > 0 && <Divider />}
                      {renderDeductionSection(type)}
                    </Box>
                  ))}
                </Card>

                <Divider sx={{ my: 1.5 }} />
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Net per paycheck</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(calculatedValues.netPay)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Typography variant="caption" color="text.secondary">Net monthly</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: "#059669" }}>
                      {formatCurrency(calculatedValues.estimatedMonthlyNet)}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {showPaycheckCard ? (
            <TextField
              fullWidth
              size="small"
              label="Estimated monthly"
              value={formatCurrency(calculatedValues.estimatedMonthlyNet)}
              disabled
              sx={{
                "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2, bgcolor: "#f8fafc" },
                "& input": { textAlign: "right" },
              }}
            />
          ) : isAutoLinkedTransfer && editingCategory ? (
            <TextField
              fullWidth
              size="small"
              label="Estimated monthly transfer"
              value={formatCurrency(editingCategory.estimatedMonthly)}
              disabled
              helperText="Synced automatically from a linked paycheck deduction."
              sx={{
                "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2, bgcolor: "#f8fafc" },
                "& input": { textAlign: "right" },
              }}
            />
          ) : (
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
          )}

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
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
        <Button onClick={onClose} disabled={isSaving} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={isSaving} sx={{ height: 36, borderRadius: 2, textTransform: "none", fontWeight: 700, px: 3 }}>
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Add Category"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}