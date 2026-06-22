"use client";

import type {
  BudgetLines
} from "@/lib/types";
import useBudgetingData from "@/lib/useBudgetingData";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Popover,
  Snackbar,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function formatMonthLabel(monthKey: string) {
  if (!monthKey) {
    return "Loading month";
  }

  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

// Shifts a "YYYY-MM" key by a number of months (negative goes back).
function shiftMonthKey(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

type BudgetGroup = {
  title: string;
  description: string;
  color: string;
  background: string;
  items: {
    id: string;
    label: string;
    value: string;
  }[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseBudgetInput(value: string) {
  const parsed = Number(value || 0);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

export default function BudgetsPage() {
  const {
    user,
    cashflows,
    accounts,
    budgetValues,
    setBudgetValue,
    selectedMonthKey: monthKey,
    setSelectedMonthKey: setMonthKey,
    saveBudget,
    copyPreviousMonth,
    isLoading,
    isSaving,
    error,
  } = useBudgetingData();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const isPickerOpen = Boolean(pickerAnchor);

  // Year currently shown inside the picker popover. Separate from monthKey's
  // year so the user can browse years without changing the selected month
  // until they actually click one.
  const [pickerYear, setPickerYear] = useState<number>(() =>
    Number(monthKey.split("-")[0])
  );

  const isCurrentMonth = monthKey === getCurrentMonthKey();

  useEffect(() => {
    // clear success message when month changes
    setSuccessMessage(null);
  }, [monthKey]);

  function openPicker(event: React.MouseEvent<HTMLElement>) {
    setPickerYear(Number(monthKey.split("-")[0]));
    setPickerAnchor(event.currentTarget);
  }

  function closePicker() {
    setPickerAnchor(null);
  }

  function selectMonthFromPicker(monthIndex: number) {
    // monthIndex is 0-based (0 = January)
    setMonthKey(`${pickerYear}-${String(monthIndex + 1).padStart(2, "0")}`);
    closePicker();
  }

  function goToPreviousMonth() {
    setMonthKey(shiftMonthKey(monthKey, -1));
  }

  function goToNextMonth() {
    setMonthKey(shiftMonthKey(monthKey, 1));
  }

  function goToCurrentMonth() {
    setMonthKey(getCurrentMonthKey());
  }

  const activeCashflows = useMemo(
    () => cashflows.filter((cashflow) => !cashflow.isArchived),
    [cashflows]
  );

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.isArchived),
    [accounts]
  );

  const incomeCashflows = useMemo(
    () => activeCashflows.filter((cashflow) => cashflow.kind === "income"),
    [activeCashflows]
  );

  const expenseCashflows = useMemo(
    () => activeCashflows.filter((cashflow) => cashflow.kind === "expense"),
    [activeCashflows]
  );

  const assetAccounts = useMemo(
    () => activeAccounts.filter((account) => account.normalBalance === "asset"),
    [activeAccounts]
  );

  const liabilityAccounts = useMemo(
    () =>
      activeAccounts.filter((account) => account.normalBalance === "liability"),
    [activeAccounts]
  );

  const budgetGroups: BudgetGroup[] = useMemo(
    () => [
      {
        title: "Income",
        description: "Expected money coming in this month.",
        color: "#059669",
        background: "#ecfdf5",
        items: incomeCashflows.map((cashflow) => ({
          id: `cashflow_${cashflow.id}`,
          label: cashflow.name,
          value: budgetValues[`cashflow_${cashflow.id}`] ?? "0.00",
        })),
      },
      {
        title: "Expenses",
        description: "Planned monthly spending.",
        color: "#dc2626",
        background: "#fef2f2",
        items: expenseCashflows.map((cashflow) => ({
          id: `cashflow_${cashflow.id}`,
          label: cashflow.name,
          value: budgetValues[`cashflow_${cashflow.id}`] ?? "0.00",
        })),
      },
      {
        title: "Savings",
        description: "Planned contributions to savings and investing.",
        color: "#7c3aed",
        background: "#f5f3ff",
        items: assetAccounts.map((account) => ({
          id: `account_${account.id}`,
          label: account.name,
          value: budgetValues[`account_${account.id}`] ?? "0.00",
        })),
      },
      {
        title: "Debt",
        description: "Planned debt payments and paydowns.",
        color: "#ea580c",
        background: "#fff7ed",
        items: liabilityAccounts.map((account) => ({
          id: `account_${account.id}`,
          label: account.name,
          value: budgetValues[`account_${account.id}`] ?? "0.00",
        })),
      },
    ],
    [
      incomeCashflows,
      expenseCashflows,
      assetAccounts,
      liabilityAccounts,
      budgetValues,
    ]
  );

  const summary = useMemo(() => {
    const income = incomeCashflows.reduce((total, cashflow) => {
      return total + parseBudgetInput(budgetValues[`cashflow_${cashflow.id}`]);
    }, 0);

    const expenses = expenseCashflows.reduce((total, cashflow) => {
      return total + parseBudgetInput(budgetValues[`cashflow_${cashflow.id}`]);
    }, 0);

    const savings = assetAccounts.reduce((total, account) => {
      return total + parseBudgetInput(budgetValues[`account_${account.id}`]);
    }, 0);

    const debt = liabilityAccounts.reduce((total, account) => {
      return total + parseBudgetInput(budgetValues[`account_${account.id}`]);
    }, 0);

    const remaining = income - expenses - savings - debt;

    return [
      { label: "Total Income", value: income, color: "#059669" },
      { label: "Total Expenses", value: expenses, color: "#dc2626" },
      { label: "Total Savings", value: savings, color: "#7c3aed" },
      { label: "Total Debt", value: debt, color: "#ea580c" },
      {
        label: "Remaining Cash Flow",
        value: remaining,
        color: remaining >= 0 ? "#059669" : "#dc2626",
      },
    ];
  }, [
    incomeCashflows,
    expenseCashflows,
    assetAccounts,
    liabilityAccounts,
    budgetValues,
  ]);

  function handleBudgetValueChange(lineId: string, nextValue: string) {
    setBudgetValue(lineId, nextValue);
  }

  async function handleSaveBudget() {
    if (!user) {
      return;
    }

    try {
      setSuccessMessage(null);

      const lines: BudgetLines = {};

      for (const cashflow of activeCashflows) {
        const lineId = `cashflow_${cashflow.id}`;

        lines[lineId] = {
          id: lineId,
          lineType: "cashflow",
          cashflowId: cashflow.id,
          planned: parseBudgetInput(budgetValues[lineId]),
        };
      }

      for (const account of activeAccounts) {
        const lineId = `account_${account.id}`;

        lines[lineId] = {
          id: lineId,
          lineType: "account_transfer",
          toAccountId: account.id,
          planned: parseBudgetInput(budgetValues[lineId]),
        };
      }

      await saveBudget(monthKey, lines);

      setSuccessMessage("Budget saved.");
    } catch (saveError) {
      console.error(saveError);
    }
  }

  async function handleCopyPreviousMonth() {
    try {
      await copyPreviousMonth(monthKey);
      setSuccessMessage(`Copied budget from previous month.`);
    } catch (copyError) {
      console.error(copyError);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1.5}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Budgets
        </Typography>

        {(error || successMessage) && <Snackbar
          open={Boolean(error || successMessage)}
          autoHideDuration={5000}
          onClose={() => setSuccessMessage(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Alert
            severity={error ? "error" : "success"}
            variant="filled"
            onClose={() => setSuccessMessage(null)}
            sx={{
              borderRadius: 2,
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
              fontWeight: 600,
            }}
          >
            {error ? error : successMessage}
          </Alert>
        </Snackbar>}
        <Stack
          spacing={2}
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "8px",
                bgcolor: "background.paper",
                height: "40px",
                overflow: "hidden",
              }}
            >
              <IconButton
                onClick={goToPreviousMonth}
                aria-label="Previous month"
                sx={{
                  borderRadius: 0,
                  height: "100%",
                  px: "8px",
                }}
              >
                <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>

              <Divider orientation="vertical" flexItem />

              <Box
                onClick={openPicker}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  px: "12px",
                  height: "100%",
                  cursor: "pointer",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    minWidth: "120px",
                    textAlign: "center",
                  }}
                >
                  {formatMonthLabel(monthKey)}
                </Typography>
              </Box>

              <Divider orientation="vertical" flexItem />

              <IconButton
                onClick={goToNextMonth}
                aria-label="Next month"
                sx={{
                  borderRadius: 0,
                  height: "100%",
                  px: "8px",
                }}
              >
                <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>

            <Popover
              open={isPickerOpen}
              anchorEl={pickerAnchor}
              onClose={closePicker}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
              slotProps={{
                paper: {
                  sx: {
                    borderRadius: "12px",
                    border: "1px solid",
                    borderColor: "divider",
                    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
                    mt: "4px",
                  },
                },
              }}
            >
              <Box sx={{ p: "16px", width: "280px" }}>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: "12px",
                  }}
                >
                  <IconButton
                    onClick={() => setPickerYear((year) => year - 1)}
                    aria-label="Previous year"
                    size="small"
                  >
                    <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>

                  <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    {pickerYear}
                  </Typography>

                  <IconButton
                    onClick={() => setPickerYear((year) => year + 1)}
                    aria-label="Next year"
                    size="small"
                  >
                    <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Box>

                <Grid container spacing="8px">
                  {MONTH_SHORT_LABELS.map((label, index) => {
                    const candidateKey = `${pickerYear}-${String(
                      index + 1
                    ).padStart(2, "0")}`;
                    const isSelected = candidateKey === monthKey;

                    return (
                      <Grid key={label} size={4}>
                        <Button
                          onClick={() => selectMonthFromPicker(index)}
                          variant={isSelected ? "contained" : "text"}
                          fullWidth
                          sx={{
                            borderRadius: "8px",
                            textTransform: "none",
                            fontWeight: 600,
                            minWidth: 0,
                            height: "36px",
                          }}
                        >
                          {label}
                        </Button>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>
            </Popover>
                        {!isCurrentMonth && (
              <Button
                onClick={goToCurrentMonth}
                variant="text"
                size="small"
                sx={{
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: 600,
                }}
              >
                Today
              </Button>
            )}
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "10px",
            }}
          >
            <Button
              variant="outlined"
              startIcon={<ContentCopyRoundedIcon />}
              onClick={handleCopyPreviousMonth}
              disabled={isLoading || isSaving}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              Copy Previous Month
            </Button>

            <Button
              variant="contained"
              startIcon={<SaveRoundedIcon />}
              onClick={handleSaveBudget}
              disabled={isLoading || isSaving}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {isSaving ? "Saving..." : "Save Budget"}
            </Button>
          </Box>
        </Stack>
      </Stack>

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          bgcolor: "background.paper",
        }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Grid container spacing={2}>
            {summary.map((item) => (
              <Grid key={item.label} size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontWeight: 600 }}
                  >
                    {item.label}
                  </Typography>

                  <Typography
                    variant="h6"
                    sx={{
                      mt: 0.5,
                      color: item.color,
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {formatCurrency(item.value)}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 3,
            bgcolor: "background.paper",
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="body2" color="text.secondary">
              Loading budget...
            </Typography>
          </CardContent>
        </Card>
      ) : (
        budgetGroups.map((group) => (
          <Card
            key={group.title}
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  bgcolor: group.background,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack
                  spacing={0.5}
                  sx={{
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: { xs: "flex-start", sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{
                        color: group.color,
                        fontWeight: 700,
                      }}
                    >
                      {group.title}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      {group.description}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Box sx={{ px: 3, py: 2.5 }}>
                {group.items.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No active items in this section yet.
                  </Typography>
                ) : (
                  <Grid container spacing={2}>
                    {group.items.map((item) => (
                      <Grid key={item.id} size={{ xs: 12, md: 6 }}>
                        <TextField
                          fullWidth
                          label={item.label}
                          type="number"
                          value={item.value}
                          onChange={(event) =>
                            handleBudgetValueChange(item.id, event.target.value)
                          }
                          size="small"
                          slotProps={{
                            htmlInput: {
                              min: 0,
                              step: 0.01,
                            },
                            input: {
                              startAdornment: (
                                <InputAdornment position="start">
                                  $
                                </InputAdornment>
                              ),
                            },
                          }}
                          sx={{
                            "& input": {
                              textAlign: "right",
                            },
                          }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            </CardContent>
          </Card>
        ))
      )}
    </Stack>
  );
}