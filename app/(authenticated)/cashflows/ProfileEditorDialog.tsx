"use client";

import type { Cashflow, WithholdingProfile } from "@/lib/types/types";
import useAuth from "@/lib/hooks/useAuth";
import useCashflows from "@/lib/hooks/useCashflows";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
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
    Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";

const payFrequencyOptions = [
  { label: "Weekly (52/yr)", value: "weekly", multiplier: 52 / 12 },
  { label: "Bi-weekly (26/yr)", value: "biweekly", multiplier: 26 / 12 },
  { label: "Semi-monthly (24/yr)", value: "semimonthly", multiplier: 24 / 12 },
  { label: "Monthly (12/yr)", value: "monthly", multiplier: 12 / 12 },
];

export function calculateWithholdings(gross: number, deductions: WithholdingProfile["deductions"], frequency: string) {
  let totalWithheld = 0;

  for (const deduction of deductions) {
    if (deduction.kind === "percentOfGross") {
      totalWithheld += (deduction.value / 100) * gross;
    } else {
      totalWithheld += deduction.value;
    }
  }

  const netPay = Math.max(0, gross - totalWithheld);
  
  // Find monthly conversion multiplier
  const option = payFrequencyOptions.find((o) => o.value === frequency);
  const multiplier = option ? option.multiplier : 2; 

  return {
    netPay,
    totalWithheld,
    estimatedMonthlyNet: netPay * multiplier,
    estimatedMonthlyGross: gross * multiplier
  };
}

export default function ProfileEditorDialog({
  open,
  onClose,
  editingProfileId,
  incomeCashflows,
}: {
  open: boolean;
  onClose: () => void;
  editingProfileId: string | null;
  incomeCashflows: Cashflow[];
}) {
  const isEditing = editingProfileId !== null;
  const { user, authLoading } = useAuth();
  const { addWithholdingProfile, updateWithholdingProfile, getProfileById } = useCashflows(user, authLoading);

  const [profileName, setProfileName] = useState("");
  const [payFrequency, setPayFrequency] = useState("biweekly");
  const [grossSalary, setGrossSalary] = useState("0");
  const [relatedCashflowId, setRelatedCashflowId] = useState("");
  const [deductions, setDeductions] = useState<WithholdingProfile["deductions"]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newDeductionLabel, setNewDeductionLabel] = useState("");
  const [newDeductionValue, setNewDeductionValue] = useState("0");
  const [newDeductionKind, setNewDeductionKind] = useState<"percentOfGross" | "flatAmount">("percentOfGross");

  useEffect(() => {
    if (!open) return;

    if (isEditing && editingProfileId) {
      const profile = getProfileById(editingProfileId);
      if (profile) {
        setProfileName(profile.name);
        setPayFrequency(profile.payFrequency);
        setGrossSalary(String(profile.grossSalary));
        setRelatedCashflowId(profile.linkedIncomeCashflowId);
        setDeductions(profile.deductions || []);
      }
    } else {
      setProfileName("");
      setPayFrequency("biweekly");
      setGrossSalary("0");
      setRelatedCashflowId("");
      setDeductions([]);
    }
  }, [open, isEditing, editingProfileId, getProfileById]);

  async function handleSave() {
    setError(null);
    if (!profileName.trim() || !relatedCashflowId) {
      setError("Profile name and an income cashflow are required.");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name: profileName.trim(),
        payFrequency: payFrequency as WithholdingProfile["payFrequency"],
        grossSalary: Number(grossSalary),
        linkedIncomeCashflowId: relatedCashflowId,
        deductions: deductions.map(d => ({
          label: d.label,
          value: d.value,
          kind: d.kind,
          when: d.when || "preTax" // Defaulting fallback back-compatibility cleanly
        })),
      };

      if (isEditing) {
        await updateWithholdingProfile(editingProfileId, payload);
      } else {
        await addWithholdingProfile(payload);
      }
      onClose();
    } catch (saveError) {
      setError("Failed to save withholding profile.");
      console.error(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddDeduction() {
    setError(null);
    if (!newDeductionLabel.trim()) {
      setError("Deduction label is required.");
      return;
    }

    const value = Number(newDeductionValue);
    if (Number.isNaN(value) || value < 0) {
      setError("Invalid deduction value.");
      return;
    }

    const newDeduction = {
      label: newDeductionLabel.trim(),
      value,
      kind: newDeductionKind,
      when: "preTax" as const,
    };

    setDeductions((prev) => [...prev, newDeduction]);
    setNewDeductionLabel("");
    setNewDeductionValue("0");
  }

  const calculatedValues = useMemo(() => {
    return calculateWithholdings(Number(grossSalary), deductions, payFrequency);
  }, [grossSalary, deductions, payFrequency]);

  return (
    <Dialog fullWidth maxWidth="md" onClose={onClose} open={open}>
      <DialogTitle>
        {isEditing ? `Edit Pay Stub Profile` : "Create Pay Stub Profile"}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8, color: "text.secondary" }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1, p: 3 }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Core Income Details */}
          <Card sx={{ bgcolor: "#f8fafc", border: "1px solid", borderColor: "divider", borderRadius: 2 }} elevation={0}>
            <CardContent sx={{ p: 2 }}>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Profile Name (e.g. Primary Job)"
                    onChange={(e) => setProfileName(e.target.value)}
                    size="small"
                    value={profileName}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Pay Frequency</InputLabel>
                    <Select onChange={(e) => setPayFrequency(e.target.value)} value={payFrequency} label="Pay Frequency">
                      {payFrequencyOptions.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField
                    fullWidth
                    label="Gross Pay"
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
                    options={incomeCashflows}
                    size="small"
                    value={incomeCashflows.find((c) => c.id === relatedCashflowId) || null}
                    onChange={(_, newValue) => setRelatedCashflowId(newValue ? newValue.id : "")}
                    renderInput={(params) => <TextField {...params} label="Link directly to Income Budget Category" />}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Simple Calculations Output Card */}
          <Card
            sx={{
              bgcolor: "#f0fdf4",
              border: "1px solid",
              borderColor: "#bbf7d0",
              borderRadius: 2,
              color: "#166534",
            }}
            elevation={0}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 700, mb: 1.5}}>
                Paycheck Math Breakdown
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ textTransform: 'uppercase', tracking: 0.5, fontWeight: 700, color: 'text.secondary' }}>Per Paycheck</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2">Gross Pay Amount:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(Number(grossSalary))}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                      <Typography variant="body2">Total Withheld/Deducted:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>-{formatCurrency(calculatedValues.totalWithheld)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Take-Home Deposit:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(calculatedValues.netPay)}</Typography>
                    </Box>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ textTransform: 'uppercase', tracking: 0.5, fontWeight: 700, color: 'text.secondary' }}>Estimated Monthly Impact</Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                      <Typography variant="body2">Projected Monthly Gross:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(calculatedValues.estimatedMonthlyGross)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", pt: 1, borderTop: "1px dashed", borderColor: "#bbf7d0" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Projected Monthly Net:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: "1rem" }}>{formatCurrency(calculatedValues.estimatedMonthlyNet)}</Typography>
                    </Box>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Deductions Builder Form */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Pay Stub Line Items (Taxes, 401k, Insurance)</Typography>
            <Card sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "#fafafa" }} elevation={0}>
              <CardContent sx={{ p: 2 }}>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 5 }}>
                    <TextField
                      fullWidth
                      label="Item Label (e.g. Federal Tax, Health Ins.)"
                      onChange={(e) => setNewDeductionLabel(e.target.value)}
                      size="small"
                      value={newDeductionLabel}
                      slotProps={{ htmlInput: { style: { backgroundColor: '#fff' } } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 2.5 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Type</InputLabel>
                      <Select onChange={(e) => setNewDeductionKind(e.target.value as any)} value={newDeductionKind} label="Type" sx={{ bgcolor: '#fff' }}>
                        <MenuItem value="percentOfGross">% Percentage</MenuItem>
                        <MenuItem value="flatAmount">$ Flat Amount</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 2.5 }}>
                    <TextField
                      fullWidth
                      label="Amount"
                      onChange={(e) => setNewDeductionValue(e.target.value)}
                      size="small"
                      type="number"
                      value={newDeductionValue}
                      slotProps={{
                        htmlInput: { style: { backgroundColor: '#fff' } },
                        input: {
                          startAdornment: newDeductionKind === "flatAmount" ? <InputAdornment position="start">$</InputAdornment> : null,
                          endAdornment: newDeductionKind === "percentOfGross" ? <InputAdornment position="end">%</InputAdornment> : null,
                        }
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 2 }}>
                    <Button
                      fullWidth
                      onClick={handleAddDeduction}
                      size="medium"
                      startIcon={<TrendingDownRoundedIcon />}
                      variant="contained"
                      color="secondary"
                      sx={{ textTransform: "none", fontWeight: 600, borderRadius: 1.5, height: "40px" }}
                    >
                      Add
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* List of active line items copyable from user stub */}
            {deductions.length > 0 && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                {deductions.map((deduction, index) => (
                  <Card
                    key={index}
                    sx={{
                      bgcolor: "#ffffff",
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.5,
                    }}
                    elevation={0}
                  >
                    <CardContent sx={{ p: "8px 16px" }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Stack spacing={0.25}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{deduction.label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {deduction.kind === "percentOfGross" 
                              ? `${deduction.value}% of gross (${formatCurrency((deduction.value / 100) * Number(grossSalary))})` 
                              : `${formatCurrency(deduction.value)} flat amount`
                            }
                          </Typography>
                        </Stack>
                        <Tooltip title="Delete Item">
                          <IconButton onClick={() => setDeductions((prev) => prev.filter((_, i) => i !== index))} size="small">
                            <DeleteRoundedIcon sx={{ color: "#dc2626", fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ pt: 0, p: 3 }}>
        <Button color="inherit" onClick={onClose} sx={{ textTransform: "none", fontWeight: 700 }}>
          Cancel
        </Button>
        <Button disabled={isSaving} onClick={handleSave} variant="contained" sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2 }}>
          {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Profile"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}