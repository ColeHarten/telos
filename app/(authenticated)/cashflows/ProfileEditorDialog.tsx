"use client";

import type { Cashflow, WithholdingProfile } from "@/lib/types/types";
import useBudgetingData from "@/lib/useBudgetingData";
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
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
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
    Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";

const payFrequencyOptions = [
  { label: "Weekly", value: "weekly" },
  { label: "Bi-weekly", value: "biweekly" },
  { label: "Semi-monthly", value: "semimonthly" },
  { label: "Monthly", value: "monthly" },
];

export function calculateWithholdings(gross: number, deductions: WithholdingProfile["deductions"]) {
  let netPay = gross;
  let preTaxWithholding = 0;
  const taxWithholding = gross * 0.22; // Placeholder 22% overall tax for simple visual
  let postTaxWithholding = 0;

  for (const deduction of deductions) {
    let amount = deduction.value;
    if (deduction.kind === "percentOfGross") {
      amount = (deduction.value / 100) * gross;
    }

    if (deduction.when === "preTax") {
      preTaxWithholding += amount;
      netPay -= amount;
    } else if (deduction.when === "postTax") {
      postTaxWithholding += amount;
      netPay -= amount;
    }
  }

  netPay -= taxWithholding;
  const totalWithholding = preTaxWithholding + taxWithholding + postTaxWithholding;

  return { netPay, totalWithholding, taxWithholding };
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
  const [newDeductionWhen, setNewDeductionWhen] = useState<"preTax" | "postTax">("preTax");

  useEffect(() => {
    if (open && isEditing && editingProfileId) {
      const profile = getProfileById(editingProfileId);
      if (profile) {
        setProfileName(profile.name);
        setPayFrequency(profile.payFrequency);
        setGrossSalary(String(profile.grossSalary));
        setRelatedCashflowId(profile.linkedIncomeCashflowId);
        setDeductions(profile.deductions);
      }
    } else if (open) {
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
        deductions: deductions,
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
      when: newDeductionWhen,
    };

    setDeductions((prev) => [...prev, newDeduction]);
    setNewDeductionLabel("");
    setNewDeductionValue("0");
  }

  const calculatedValues = useMemo(() => {
    return calculateWithholdings(Number(grossSalary), deductions);
  }, [grossSalary, deductions]);

  return (
    <Dialog fullWidth maxWidth="md" onClose={onClose} open={open}>
      <DialogTitle>
        {isEditing ? `Edit Profile: ${profileName}` : "Create Withholding Profile"}
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

          {/* Primary Profile Details */}
          <Card sx={{ bgcolor: "#f8fafc", border: "1px solid", borderColor: "divider", borderRadius: 2 }} elevation={0}>
            <CardContent sx={{ p: 2 }}>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Profile Name"
                    onChange={(e) => setProfileName(e.target.value)}
                    size="small"
                    value={profileName}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Frequency</InputLabel>
                    <Select onChange={(e) => setPayFrequency(e.target.value)} value={payFrequency} label="Frequency">
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
                    label="Gross Salary"
                    onChange={(e) => setGrossSalary(e.target.value)}
                    size="small"
                    type="number"
                    value={grossSalary}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Autocomplete
                    getOptionLabel={(option) => `${option.name} (${formatCurrency(option.estimatedMonthly)})`}
                    options={incomeCashflows}
                    size="small"
                    value={incomeCashflows.find((c) => c.id === relatedCashflowId) || null}
                    onChange={(_, newValue) => setRelatedCashflowId(newValue ? newValue.id : "")}
                    renderInput={(params) => <TextField {...params} label="Link to Income Cashflow" />}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Result Summary */}
          <Card
            sx={{
              bgcolor: "#ecfdf5",
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: 2,
              color: "#166534",
            }}
            elevation={0}
          >
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1, fontWeight: 600, mb: 1 }}>
                <TrendingUpRoundedIcon sx={{ fontSize: 18 }} /> Result Summary
              </Typography>
              <Stack sx={{ bgcolor: "#ffffff", border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1 }} spacing={1}>
                <Box sx={{ display: "flex", justifyContent: "space-between", color: "text.secondary" }}>
                  <Typography variant="body2">Calculated Total Withholding</Typography>
                  <Typography variant="body2" sx={{ color: "#dc2626", fontWeight: 600 }}>
                    ({formatCurrency(calculatedValues.totalWithholding)})
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Estimated Net Pay</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{formatCurrency(calculatedValues.netPay)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Deductions Section */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Add Withholdings & Deductions</Typography>
            <Card sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }} elevation={0}>
              <CardContent sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth
                        label="Label (e.g., 401(k))"
                        onChange={(e) => setNewDeductionLabel(e.target.value)}
                        size="small"
                        value={newDeductionLabel}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 2.5 }}>
                      <TextField
                        fullWidth
                        label="Value"
                        onChange={(e) => setNewDeductionValue(e.target.value)}
                        size="small"
                        type="number"
                        value={newDeductionValue}
                        slotProps={{
                          input: {
                            startAdornment: newDeductionKind === "flatAmount" ? <InputAdornment position="start">$</InputAdornment> : null,
                          }
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 2.5 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Kind</InputLabel>
                        <Select onChange={(e) => setNewDeductionKind(e.target.value as any)} value={newDeductionKind} label="Kind">
                          <MenuItem value="percentOfGross">Gross %</MenuItem>
                          <MenuItem value="flatAmount">Flat $</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <Box sx={{ display: "flex", alignItems: "center", height: "40px" }}>
                        <Typography variant="caption" sx={{ color: newDeductionWhen === "preTax" ? "#166534" : "text.secondary", fontWeight: 600 }}>
                          Pre-tax
                        </Typography>
                        <Switch
                          checked={newDeductionWhen === "postTax"}
                          color="primary"
                          size="small"
                          onChange={(e) => setNewDeductionWhen(e.target.checked ? "postTax" : "preTax")}
                        />
                        <Typography variant="caption" sx={{ color: newDeductionWhen === "postTax" ? "#166534" : "text.secondary", fontWeight: 600 }}>
                          Post-tax
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  <Box sx={{ bgcolor: "#f8fafc", border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 2 }}>
                    <Grid container spacing={1.5}>
                      <Grid size={{ xs: 12, sm: 9 }}>
                        <FormControlLabel
                          control={<Switch size="small" />}
                          label={<Typography variant="body2" color="text.secondary">Link to account transfer</Typography>}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 3 }}>
                        <Button
                          fullWidth
                          onClick={handleAddDeduction}
                          size="small"
                          startIcon={<TrendingDownRoundedIcon />}
                          variant="outlined"
                          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 1.5 }}
                        >
                          Add Deduction
                        </Button>
                      </Grid>
                    </Grid>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* List of current deductions */}
            {deductions.length > 0 && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                {deductions.map((deduction, index) => (
                  <Card
                    key={index}
                    sx={{
                      bgcolor: deduction.when === "preTax" ? "#ecfdf5" : "#f8fafc",
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.5,
                    }}
                    elevation={0}
                  >
                    <CardContent sx={{ p: "10px 16px" }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Stack spacing={0.25}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{deduction.label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {deduction.kind === "percentOfGross" ? `${deduction.value}% of gross` : `$${deduction.value} flat amount`}
                          </Typography>
                        </Stack>
                        <Box sx={{ display: "flex", alignItems: "center", spacing: 1.5 }}>
                          <Chip
                            label={deduction.when === "preTax" ? "Pre-Tax" : "Post-Tax"}
                            size="small"
                            sx={{
                              bgcolor: deduction.when === "preTax" ? "#166534" : "#64748b",
                              color: "white",
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              borderRadius: 1,
                              height: 18,
                            }}
                          />
                          <Tooltip title="Remove Deduction">
                            <IconButton onClick={() => setDeductions((prev) => prev.filter((_, i) => i !== index))} size="small">
                              <DeleteRoundedIcon sx={{ color: "#dc2626", fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
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
          {isSaving ? "Saving..." : isEditing ? "Save Profile Changes" : "Create Profile"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}