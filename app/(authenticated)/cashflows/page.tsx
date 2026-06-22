"use client";

import type { Cashflow, CashflowKind } from "@/lib/types";
import useBudgetingData from "@/lib/useBudgetingData";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
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
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

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

export default function CashflowsPage() {
  const { user, cashflows, addCashflow, updateCashflow, archiveCashflow, isLoading } = useBudgetingData();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingCashflowId, setEditingCashflowId] = useState<string | null>(
    null
  );
  const isEditingCashflow = editingCashflowId !== null;

  const [newCashflowName, setNewCashflowName] = useState("");
  const [newCashflowKind, setNewCashflowKind] =
    useState<CashflowKind>("expense");

  useEffect(() => {
    setError(null);
  }, [user, cashflows]);

  const activeCashflows = useMemo(
    () => cashflows.filter((cashflow) => !cashflow.isArchived),
    [cashflows]
  );

  const incomeCount = activeCashflows.filter(
    (cashflow) => cashflow.kind === "income"
  ).length;

  const expenseCount = activeCashflows.filter(
    (cashflow) => cashflow.kind === "expense"
  ).length;

  async function handleAddCashflow() {
    const trimmedName = newCashflowName.trim();

    if (!trimmedName) {
      setError("Cashflow name is required.");
      return;
    }

    try {
      setError(null);
      setIsSaving(true);

      await addCashflow({ name: trimmedName, kind: newCashflowKind });

      setNewCashflowName("");
      setNewCashflowKind("expense");
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
  }

  function handleCancelEditCashflow() {
    setError(null);
    setEditingCashflowId(null);
    setNewCashflowName("");
    setNewCashflowKind("expense");
  }

  async function handleSaveEditedCashflow() {
    if (!user || !editingCashflowId) {
      return;
    }

    const trimmedName = newCashflowName.trim();

    if (!trimmedName) {
      setError("Cashflow name is required.");
      return;
    }

    try {
      setError(null);
      setIsSaving(true);

      await updateCashflow(editingCashflowId, { name: trimmedName, kind: newCashflowKind } as any);

      setEditingCashflowId(null);
      setNewCashflowName("");
      setNewCashflowKind("expense");
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

  return (
    <Stack spacing={2.25}>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          letterSpacing: "-0.03em",
        }}
      >
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
            severity="error"
            variant="filled"
            onClose={() => setError(null)}
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
          <Card
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 2.25 }}>
              <Stack
                spacing={1.25}
                sx={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontWeight: 600 }}
                  >
                    Income Categories
                  </Typography>

                  <Typography
                    variant="h5"
                    sx={{
                      mt: 0.25,
                      color: "#059669",
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {incomeCount}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: "#ecfdf5",
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TrendingUpRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <Card
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 2.25 }}>
              <Stack
                spacing={1.25}
                sx={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontWeight: 600 }}
                  >
                    Expense Categories
                  </Typography>

                  <Typography
                    variant="h5"
                    sx={{
                      mt: 0.25,
                      color: "#dc2626",
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {expenseCount}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: "#fef2f2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TrendingDownRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "background.paper",
        }}
      >
        <CardContent sx={{ p: 2.25 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 700,
              mb: 1.75,
            }}
          >
            {isEditingCashflow ? "Edit Cashflow" : "Add Cashflow"}
          </Typography>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Cashflow name"
                placeholder="e.g., Groceries"
                value={newCashflowName}
                onChange={(event) => setNewCashflowName(event.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 40,
                    borderRadius: 2,
                  },
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl
                fullWidth
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 40,
                    borderRadius: 2,
                  },
                }}
              >
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type"
                  value={newCashflowKind}
                  onChange={(event) =>
                    setNewCashflowKind(event.target.value as CashflowKind)
                  }
                >
                  <MenuItem value="income">Income</MenuItem>
                  <MenuItem value="expense">Expense</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: '10px',
                }}
              >
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleSubmitCashflow}
                  disabled={isSaving}
                  sx={{
                    height: 40,
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  {isEditingCashflow ? "Save" : isSaving ? "Adding..." : "Add"}
                </Button>

                {isEditingCashflow && (
                  <Button
                    variant="outlined"
                    onClick={handleCancelEditCashflow}
                    disabled={isSaving}
                    sx={{
                      height: 40,
                      minWidth: 84,
                      borderRadius: 2,
                      textTransform: "none",
                      fontWeight: 700,
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            px: 2.25,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="body1"
            sx={{
              fontWeight: 700,
            }}
          >
            Your Cashflows
          </Typography>
        </Box>

        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: { xs: "none", md: "grid" },
              gridTemplateColumns: "1fr 140px 120px 96px",
              px: 2.25,
              py: 1,
              bgcolor: "#f8fafc",
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700 }}
            >
              Category
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700 }}
            >
              Type
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700 }}
            >
              Status
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700, textAlign: "right" }}
            >
              Actions
            </Typography>
          </Box>

          {isLoading ? (
            <Box sx={{ p: 2.25 }}>
              <Typography variant="body2" color="text.secondary">
                Loading cashflows...
              </Typography>
            </Box>
          ) : activeCashflows.length === 0 ? (
            <Box sx={{ p: 2.25 }}>
              <Typography variant="body2" color="text.secondary">
                No cashflows yet. Add your first income or expense category
                above.
              </Typography>
            </Box>
          ) : (
            activeCashflows.map((cashflow, index) => {
              const style = cashflowStyles[cashflow.kind];
              const Icon = style.icon;

              return (
                <Box key={cashflow.id}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "1fr 140px 120px 96px",
                      },
                      gap: { xs: 1, md: 0 },
                      alignItems: "center",
                      px: 2.25,
                      py: { xs: 1.5, md: 1 },
                      minHeight: { md: 46 },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <Box
                        sx={{
                          width: 30,
                          height: 30,
                          borderRadius: 2,
                          bgcolor: style.background,
                          color: style.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 17 }} />
                      </Box>

                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                        }}
                      >
                        {cashflow.name}
                      </Typography>
                    </Box>

                    <Box>
                      <Chip
                        label={style.label}
                        size="small"
                        sx={{
                          height: 22,
                          color: style.color,
                          bgcolor: style.background,
                          fontWeight: 700,
                          borderRadius: 1.25,
                          "& .MuiChip-label": {
                            px: 1,
                            fontSize: 12,
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Chip
                        label="Active"
                        size="small"
                        sx={{
                          height: 22,
                          color: "#059669",
                          bgcolor: "#ecfdf5",
                          fontWeight: 700,
                          borderRadius: 1.25,
                          "& .MuiChip-label": {
                            px: 1,
                            fontSize: 12,
                          },
                        }}
                      />
                    </Box>

                    <Box
                      sx={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: { xs: "flex-start", md: "flex-end" },
                        gap: '10px',
                      }}
                    >
                      <IconButton
                        size="small"
                        aria-label={`Edit ${cashflow.name}`}
                        onClick={() => handleStartEditCashflow(cashflow)}
                        sx={{
                          color: "text.secondary",
                        }}
                      >
                        <EditRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>

                      <IconButton
                        size="small"
                        aria-label={`Archive ${cashflow.name}`}
                        onClick={() => handleArchiveCashflow(cashflow.id)}
                        sx={{
                          color: "#dc2626",
                        }}
                      >
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
    </Stack>
  );
}