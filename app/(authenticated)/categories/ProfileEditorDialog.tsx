"use client";

import type { Category, PaycheckProfile } from "@/lib/types/types";
import useAuth from "@/lib/hooks/useAuth";
import useCategories from "@/lib/hooks/useCategories";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";

const payFrequencyOptions = [
  { label: "Weekly (52/yr)", shortLabel: "Weekly", value: "weekly", multiplier: 52 / 12 },
  { label: "Bi-weekly (26/yr)", shortLabel: "Bi-weekly", value: "biweekly", multiplier: 26 / 12 },
  { label: "Semi-monthly (24/yr)", shortLabel: "Semi-monthly", value: "semimonthly", multiplier: 24 / 12 },
  { label: "Monthly (12/yr)", shortLabel: "Monthly", value: "monthly", multiplier: 12 / 12 },
];

export function calculateWithholdings(gross: number, deductions: PaycheckProfile["deductions"], frequency: string) {
  let totalWithheld = 0;

  for (const deduction of deductions) {
    if (deduction.kind === "percentOfGross") {
      totalWithheld += (deduction.value / 100) * gross;
    } else {
      totalWithheld += deduction.value;
    }
  }

  const netPay = Math.max(0, gross - totalWithheld);
  const option = payFrequencyOptions.find((o) => o.value === frequency);
  const multiplier = option ? option.multiplier : 2;

  return {
    netPay,
    totalWithheld,
    estimatedMonthlyNet: netPay * multiplier,
    estimatedMonthlyGross: gross * multiplier,
    estimatedMonthlyWithheld: totalWithheld * multiplier,
  };
}

type DeductionRow = PaycheckProfile["deductions"][number];

export default function ProfileEditorDialog({
  open,
  onClose,
  editingProfileId,
  incomeCategories,
}: {
  open: boolean;
  onClose: () => void;
  editingProfileId: string | null;
  incomeCategories: Category[];
}) {
  const isEditing = editingProfileId !== null;
  const { user, authLoading } = useAuth();
  const { addPaycheckProfile, updatePaycheckProfile, getProfileById } = useCategories(user, authLoading);

  const [profileName, setProfileName] = useState("");
  const [payFrequency, setPayFrequency] = useState("biweekly");
  const [grossSalary, setGrossSalary] = useState("0");
  const [relatedCategoryId, setRelatedCategoryId] = useState("");
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (isEditing && editingProfileId) {
      const profile = getProfileById(editingProfileId);
      if (profile) {
        setProfileName(profile.name);
        setPayFrequency(profile.payFrequency);
        setGrossSalary(String(profile.grossSalary));
        setRelatedCategoryId(profile.linkedIncomeCategoryId);
        setDeductions((profile.deductions || []).map((d) => ({ ...d, when: d.when || "preTax" })));
      }
    } else {
      setProfileName("");
      setPayFrequency("biweekly");
      setGrossSalary("0");
      setRelatedCategoryId("");
      setDeductions([]);
    }
    setError(null);
  }, [open, isEditing, editingProfileId, getProfileById]);

  function addDeductionRow() {
    setDeductions((prev) => [...prev, { label: "", value: 0, kind: "percentOfGross", when: "preTax" }]);
  }

  function updateDeductionRow(index: number, changes: Partial<DeductionRow>) {
    setDeductions((prev) => prev.map((d, i) => (i === index ? { ...d, ...changes } : d)));
  }

  function removeDeductionRow(index: number) {
    setDeductions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    if (!profileName.trim() || !relatedCategoryId) {
      setError("Profile name and an income category are required.");
      return;
    }

    try {
      setIsSaving(true);
      const cleanedDeductions = deductions
        .filter((d) => d.label.trim().length > 0)
        .map((d) => ({ label: d.label.trim(), value: d.value, kind: d.kind, when: d.when || "preTax" }));

      const payload = {
        name: profileName.trim(),
        payFrequency: payFrequency as PaycheckProfile["payFrequency"],
        grossSalary: Number(grossSalary),
        linkedIncomeCategoryId: relatedCategoryId,
        deductions: cleanedDeductions,
      };

      if (isEditing && editingProfileId) {
        await updatePaycheckProfile(editingProfileId, payload);
      } else {
        await addPaycheckProfile(payload);
      }
      onClose();
    } catch (saveError) {
      setError("Failed to save paycheck profile.");
      console.error(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  const calculatedValues = useMemo(
    () => calculateWithholdings(Number(grossSalary), deductions, payFrequency),
    [grossSalary, deductions, payFrequency]
  );

  const frequencyShortLabel = payFrequencyOptions.find((o) => o.value === payFrequency)?.shortLabel ?? "";

  return (
    <Dialog fullWidth maxWidth="md" onClose={onClose} open={open}>
      <DialogTitle sx={{ pb: 0.5 }}>
        {isEditing ? "Edit Paycheck Profile" : "Create Paycheck Profile"}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
          Define how your gross pay is converted to take-home pay.
        </Typography>
        <IconButton aria-label="close" onClick={onClose} sx={{ position: "absolute", right: 8, top: 8, color: "text.secondary" }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 2, p: 3 }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Core Income Details */}
          <Card sx={{ bgcolor: "#f8fafc", border: "1px solid", borderColor: "divider", borderRadius: 2 }} elevation={0}>
            <CardContent sx={{ p: 2 }}>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth label="Profile Name (e.g. Primary Job)" onChange={(e) => setProfileName(e.target.value)} size="small" value={profileName} />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Pay Frequency</InputLabel>
                    <Select onChange={(e) => setPayFrequency(e.target.value)} value={payFrequency} label="Pay Frequency">
                      {payFrequencyOptions.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField
                    fullWidth
                    label="Gross Pay (per paycheck)"
                    onChange={(e) => setGrossSalary(e.target.value)}
                    size="small"
                    type="number"
                    value={grossSalary}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Autocomplete
                    getOptionLabel={(option) => `${option.name} (${formatCurrency(option.estimatedMonthly)}/mo expected)`}
                    options={incomeCategories}
                    size="small"
                    value={incomeCategories.find((c) => c.id === relatedCategoryId) || null}
                    onChange={(_, newValue) => setRelatedCategoryId(newValue ? newValue.id : "")}
                    renderInput={(params) => <TextField {...params} label="Link to Income Category" helperText="Select the income category this profile applies to." />}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Estimated Take-Home Pay */}
          <Card sx={{ bgcolor: "#f0fdf4", border: "1px solid", borderColor: "#bbf7d0", borderRadius: 2, color: "#166534" }} elevation={0}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Estimated Take-Home Pay</Typography>
              <Divider sx={{ mb: 1.5 }} />
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ textTransform: "uppercase", fontWeight: 700, color: "text.secondary" }}>Per Paycheck</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2">Gross Pay</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(Number(grossSalary))}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                      <Typography variant="body2">Total Deductions</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>-{formatCurrency(calculatedValues.totalWithheld)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Net Pay</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(calculatedValues.netPay)}</Typography>
                    </Box>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ textTransform: "uppercase", fontWeight: 700, color: "text.secondary" }}>Monthly ({frequencyShortLabel})</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2">Gross Pay</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(calculatedValues.estimatedMonthlyGross)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                      <Typography variant="body2">Total Deductions</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>-{formatCurrency(calculatedValues.estimatedMonthlyWithheld)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", pt: 0.5, borderTop: "1px solid", borderColor: "#bbf7d0" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Net Pay</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: "1rem" }}>{formatCurrency(calculatedValues.estimatedMonthlyNet)}</Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Deductions */}
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Deductions</Typography>
                <Typography variant="body2" color="text.secondary">Add your pre-tax and post-tax deductions. These are subtracted from your gross pay.</Typography>
              </Box>
              <Button onClick={addDeductionRow} size="small" startIcon={<AddRoundedIcon />} variant="outlined" sx={{ textTransform: "none", fontWeight: 600, borderRadius: 1.5, whiteSpace: "nowrap" }}>
                Add Deduction
              </Button>
            </Box>

            {deductions.length > 0 && (
              <Card sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }} elevation={0}>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 120px 40px", bgcolor: "#f8fafc", px: 2, py: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Label</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Type</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Amount</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Applied To</Typography>
                  <Box />
                </Box>
                <Stack divider={<Divider />}>
                  {deductions.map((deduction, index) => (
                    <Box key={index} sx={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 120px 40px", alignItems: "center", gap: 1, px: 2, py: 1 }}>
                      <TextField
                        placeholder="e.g. Federal Tax"
                        size="small"
                        value={deduction.label}
                        onChange={(e) => updateDeductionRow(index, { label: e.target.value })}
                        variant="standard"
                        slotProps={{ input: { disableUnderline: true } }}
                      />
                      <Select
                        size="small"
                        variant="standard"
                        value={deduction.kind}
                        onChange={(e) => updateDeductionRow(index, { kind: e.target.value as DeductionRow["kind"] })}
                        disableUnderline
                      >
                        <MenuItem value="percentOfGross">% of Gross</MenuItem>
                        <MenuItem value="flatAmount">Flat Amount</MenuItem>
                      </Select>
                      <TextField
                        size="small"
                        type="number"
                        variant="standard"
                        value={deduction.value}
                        onChange={(e) => updateDeductionRow(index, { value: Number(e.target.value) || 0 })}
                        slotProps={{
                          input: {
                            disableUnderline: true,
                            endAdornment: deduction.kind === "percentOfGross" ? <InputAdornment position="end">%</InputAdornment> : <InputAdornment position="end">$</InputAdornment>,
                          },
                        }}
                      />
                      <Select
                        size="small"
                        value={deduction.when}
                        onChange={(e) => updateDeductionRow(index, { when: e.target.value as "preTax" | "postTax" })}
                        sx={{
                          height: 30,
                          fontSize: 13,
                          fontWeight: 700,
                          borderRadius: 999,
                          bgcolor: deduction.when === "preTax" ? "#f5f3ff" : "#fff7ed",
                          color: deduction.when === "preTax" ? "#7c3aed" : "#c2410c",
                          "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                        }}
                      >
                        <MenuItem value="preTax">Pre-tax</MenuItem>
                        <MenuItem value="postTax">Post-tax</MenuItem>
                      </Select>
                      <Tooltip title="Delete Item">
                        <IconButton onClick={() => removeDeductionRow(index)} size="small">
                          <DeleteRoundedIcon sx={{ color: "#dc2626", fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Stack>
              </Card>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ pt: 0, p: 3 }}>
        <Button color="inherit" onClick={onClose} sx={{ textTransform: "none", fontWeight: 700 }}>Cancel</Button>
        <Button disabled={isSaving} onClick={handleSave} variant="contained" sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2 }}>
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Profile"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}