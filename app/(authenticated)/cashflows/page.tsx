"use client";

import useAuth from "@/lib/hooks/useAuth";
import useCashflows from "@/lib/hooks/useCashflows";
import type { Cashflow, CashflowKind } from "@/lib/types/types";
import { formatCurrency } from "@/lib/utils";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PercentRoundedIcon from "@mui/icons-material/PercentRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import ProfileEditorDialog, { calculateWithholdings } from "./ProfileEditorDialog";

const cashflowStyles: Record<
  CashflowKind,
  {
    label: string;
    color: string;
    background: string;
    icon: typeof TrendingUpRoundedIcon;
  }
> = {
  income: {
    label: "Income",
    color: "#059669",
    background: "#ecfdf5",
    icon: TrendingUpRoundedIcon,
  },
  expense: {
    label: "Expense",
    color: "#dc2626",
    background: "#fef2f2",
    icon: TrendingDownRoundedIcon,
  },
};

// --- Main Page Component ---
export default function CashflowsPage() {
  const { user, authLoading } = useAuth();
  const {
    cashflows,
    withholdingProfiles,
    addCashflow,
    updateCashflow,
    archiveCashflow,
    cashflowsLoading,
  } = useCashflows(user, authLoading);
  const isLoading = cashflowsLoading;

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingCashflowId, setEditingCashflowId] = useState<string | null>(null);
  const isEditingCashflow = editingCashflowId !== null;
  const [newCashflowName, setNewCashflowName] = useState("");
  const [newCashflowKind, setNewCashflowKind] = useState<CashflowKind>("expense");
  const [newCashflowEstimatedMonthly, setNewCashflowEstimatedMonthly] = useState("0");

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  useEffect(() => {
    setError(null);
  }, [user, cashflows]);

  const activeCashflows = useMemo(() => cashflows.filter((cashflow) => !cashflow.isArchived), [cashflows]);
  const incomeCount = activeCashflows.filter((c) => c.kind === "income").length;
  const expenseCount = activeCashflows.filter((c) => c.kind === "expense").length;
  const incomeCashflows = useMemo(() => activeCashflows.filter((c) => c.kind === "income"), [activeCashflows]);

  async function handleAddCashflow() {
    const trimmedName = newCashflowName.trim();
    const estimatedMonthly = Number(newCashflowEstimatedMonthly || 0);
    if (!trimmedName) {
      setError("Cashflow name is required.");
      return;
    }
    try {
      setError(null);
      setIsSaving(true);
      await addCashflow({
        name: trimmedName,
        kind: newCashflowKind,
        estimatedMonthly: Number.isNaN(estimatedMonthly) ? 0 : estimatedMonthly,
      });
      setNewCashflowName("");
      setNewCashflowKind("expense");
      setNewCashflowEstimatedMonthly("0");
    } catch (saveError) {
      console.error(saveError);
      setError("Could not add cashflow.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleStartEditCashflow(cashflow: Cashflow) {
    setError(null);
    setEditingCashflowId(cashflow.id);
    setNewCashflowName(cashflow.name);
    setNewCashflowKind(cashflow.kind);
    setNewCashflowEstimatedMonthly(String(cashflow.estimatedMonthly ?? 0));
  }

  function handleCancelEditCashflow() {
    setError(null);
    setEditingCashflowId(null);
    setNewCashflowName("");
    setNewCashflowKind("expense");
    setNewCashflowEstimatedMonthly("0");
  }

  async function handleSaveEditedCashflow() {
    if (!user || !editingCashflowId) return;
    const trimmedName = newCashflowName.trim();
    const estimatedMonthly = Number(newCashflowEstimatedMonthly || 0);
    if (!trimmedName) {
      setError("Cashflow name is required.");
      return;
    }
    try {
      setError(null);
      setIsSaving(true);
      await updateCashflow(editingCashflowId, {
        name: trimmedName,
        kind: newCashflowKind,
        estimatedMonthly: Number.isNaN(estimatedMonthly) ? 0 : estimatedMonthly,
      });
      setEditingCashflowId(null);
      setNewCashflowName("");
      setNewCashflowKind("expense");
      setNewCashflowEstimatedMonthly("0");
    } catch (saveError) {
      console.error(saveError);
      setError("Could not update cashflow.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmitCashflow() {
    if (isEditingCashflow) {
      await handleSaveEditedCashflow();
      return;
    }
    await handleAddCashflow();
  }

  async function handleArchiveCashflow(cashflowId: string) {
    try {
      setError(null);
      await archiveCashflow(cashflowId);
      if (editingCashflowId === cashflowId) {
        handleCancelEditCashflow();
      }
    } catch (archiveError) {
      console.error(archiveError);
      setError("Could not archive cashflow.");
    }
  }

  function handleOpenAddProfile() {
    setEditingProfileId(null);
    setProfileDialogOpen(true);
  }

  function handleOpenEditProfile(profileId: string) {
    setEditingProfileId(profileId);
    setProfileDialogOpen(true);
  }

  function handleCloseProfileDialog() {
    setProfileDialogOpen(false);
    setEditingProfileId(null);
  }

  return (
    <Stack spacing={2.25}>
      <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}>
        Cashflows
      </Typography>

      {error && (
        <Snackbar
          open={error !== null}
          autoHideDuration={5000}
          onClose={() => setError(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Alert
            onClose={() => setError(null)}
            severity="error"
            variant="filled"
            sx={{
              borderRadius: 2,
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
              fontWeight: 600,
            }}
          >
            {error}
          </Alert>
        </Snackbar>
      )}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
            <CardContent sx={{ p: 2.25 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Income Categories
                  </Typography>
                  <Typography variant="h5" sx={{ color: "#059669", fontWeight: 800, mt: 0.25, letterSpacing: "-0.03em" }}>
                    {incomeCount}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "#ecfdf5",
                    color: "#059669",
                    borderRadius: 2,
                    width: 40,
                    height: 40,
                  }}
                >
                  <TrendingUpRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
            <CardContent sx={{ p: 2.25 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Expense Categories
                  </Typography>
                  <Typography variant="h5" sx={{ color: "#dc2626", fontWeight: 800, mt: 0.25, letterSpacing: "-0.03em" }}>
                    {expenseCount}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "#fef2f2",
                    color: "#dc2626",
                    borderRadius: 2,
                    width: 40,
                    height: 40,
                  }}
                >
                  <TrendingDownRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add/Edit Cashflow Input Form */}
      <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
        <CardContent sx={{ p: 2.25 }}>
          <Typography variant="body1" sx={{ fontWeight: 700, mb: 1.75 }}>
            {isEditingCashflow ? "Edit Cashflow" : "Add Cashflow"}
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                label="Cashflow name"
                onChange={(e) => setNewCashflowName(e.target.value)}
                placeholder="e.g., Groceries"
                size="small"
                value={newCashflowName}
                sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <FormControl fullWidth size="small" sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}>
                <InputLabel>Type</InputLabel>
                <Select label="Type" onChange={(e) => setNewCashflowKind(e.target.value as CashflowKind)} value={newCashflowKind}>
                  <MenuItem value="income">Income</MenuItem>
                  <MenuItem value="expense">Expense</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                fullWidth
                label="Estimated monthly"
                onChange={(e) => setNewCashflowEstimatedMonthly(e.target.value)}
                size="small"
                type="number"
                value={newCashflowEstimatedMonthly}
                slotProps={{
                  htmlInput: { min: 0, step: 0.01 },
                  input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                }}
                sx={{ "& .MuiOutlinedInput-root": { height: 40, borderRadius: 2 } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Box sx={{ display: "flex", direction: "row", alignItems: "center", gap: "10px" }}>
                <Button
                  fullWidth
                  disabled={isSaving}
                  onClick={handleSubmitCashflow}
                  variant="contained"
                  sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, height: 40 }}
                >
                  {isEditingCashflow ? "Save" : isSaving ? "Adding..." : "Add"}
                </Button>
                {isEditingCashflow && (
                  <Button
                    disabled={isSaving}
                    onClick={handleCancelEditCashflow}
                    variant="outlined"
                    sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, height: 40, minWidth: 84 }}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Your Cashflows Datagrid View */}
      <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }} elevation={0}>
        <Box sx={{ p: 2.25, px: 2.25, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>Your Cashflows</Typography>
        </Box>
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 120px 140px 120px 96px" },
              bgcolor: "#f8fafc",
              p: 1,
              px: 2.25,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Category</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Type</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Status</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textAlign: "right" }}>Estimated monthly</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textAlign: "right" }}>Actions</Typography>
          </Box>

          {isLoading ? (
            <Box sx={{ p: 2.25 }}><Typography color="text.secondary" variant="body2">Loading cashflows...</Typography></Box>
          ) : activeCashflows.length === 0 ? (
            <Box sx={{ p: 2.25 }}><Typography color="text.secondary" variant="body2">No cashflows yet.</Typography></Box>
          ) : (
            activeCashflows.map((cashflow, index) => {
              const style = cashflowStyles[cashflow.kind];
              const Icon = style.icon;
              return (
                <Box key={cashflow.id}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 120px 140px 120px 96px" },
                      alignItems: "center",
                      gap: 1.5,
                      p: 1,
                      px: 2.25,
                      minHeight: 46,
                    }}
                  >
                    <Box sx={{ display: "flex", direction: "row", alignItems: "center", gap: "10px" }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: style.background,
                          color: style.color,
                          borderRadius: 2,
                          width: 30,
                          height: 30,
                          flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 17 }} />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{cashflow.name}</Typography>
                    </Box>
                    <Box>
                      <Chip
                        label={style.label}
                        size="small"
                        sx={{ bgcolor: style.background, color: style.color, fontWeight: 700, fontSize: 12, height: 22, px: 1, "& .MuiChip-label": { px: 1.25 } }}
                      />
                    </Box>
                    <Box>
                      <Chip
                        label="Active"
                        size="small"
                        sx={{ bgcolor: "#ecfdf5", color: "#059669", fontWeight: 700, fontSize: 12, height: 22, px: 1, "& .MuiChip-label": { px: 1.25 } }}
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, textAlign: { xs: "left", md: "right" } }}>
                        {formatCurrency(cashflow.estimatedMonthly ?? 0)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", direction: "row", alignItems: "center", justifyContent: { xs: "flex-start", md: "flex-end" }, gap: "10px" }}>
                      <IconButton aria-label={`Edit ${cashflow.name}`} onClick={() => handleStartEditCashflow(cashflow)} size="small" sx={{ color: "text.secondary" }}>
                        <EditRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                      <IconButton aria-label={`Archive ${cashflow.name}`} onClick={() => handleArchiveCashflow(cashflow.id)} size="small" sx={{ color: "#dc2626" }}>
                        <ArchiveRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  </Box>
                  {index < activeCashflows.length - 1 && <Divider />}
                </Box>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Withholding Profiles Section */}
      <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2.25, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>Your Withholding Profiles (Gross Pay to Net Pay)</Typography>
          <Button onClick={handleOpenAddProfile} size="small" startIcon={<TrendingUpRoundedIcon />} variant="contained" sx={{ textTransform: "none", fontWeight: 600, borderRadius: 1.5 }}>
            Create Profile
          </Button>
        </Box>
        <CardContent sx={{ p: withholdingProfiles.length > 0 ? 0 : 2.25 }}>
          {isLoading ? (
            <Typography color="text.secondary" variant="body2">Loading profiles...</Typography>
          ) : withholdingProfiles.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", bgcolor: "#f8fafc", p: 3, borderRadius: 2, gap: 1, color: "text.secondary" }}>
              <PercentRoundedIcon sx={{ fontSize: 32 }} />
              <Typography variant="body2" sx={{ textAlign: "center" }}>
                Define a withholding profile to automatically calculate your true income, including taxes and deductions, to bridge the gap from gross pay to your net deposits.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {withholdingProfiles.map((profile) => {
                const calculated = calculateWithholdings(profile.grossSalary, profile.deductions, profile.payFrequency);
                const relatedCashflow = cashflows.find((c) => c.id === profile.linkedIncomeCashflowId);

                return (
                  <Box key={profile.id} sx={{ p: 2.25 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 120px auto", alignItems: "center", gap: 2 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{profile.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                          {profile.payFrequency} • {profile.deductions?.length || 0} deductions
                        </Typography>
                      </Box>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">Linked Category</Typography>
                        <Typography variant="body2" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontWeight: 500 }}>
                          {relatedCashflow?.name ?? "None Linked"}
                        </Typography>
                      </Stack>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography variant="caption" color="text.secondary">Gross per Paycheck</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(profile.grossSalary)}</Typography>
                      </Box>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography variant="caption" color="text.secondary">Est. Monthly Net</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: "#166534" }}>
                          {formatCurrency(calculated.estimatedMonthlyNet)}
                        </Typography>
                      </Box>
                      <IconButton onClick={() => handleOpenEditProfile(profile.id)}>
                        <EditRoundedIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Editor Dialogue Modal */}
      <ProfileEditorDialog editingProfileId={editingProfileId} incomeCashflows={incomeCashflows} onClose={handleCloseProfileDialog} open={profileDialogOpen} />
    </Stack>
  );
}