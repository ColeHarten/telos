"use client";

import MonthPickerControl, { getCurrentMonthKey } from "@/components/MonthPickerControl";
import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import useCategories from "@/lib/hooks/useCategories";
import type {
  BudgetLines
} from "@/lib/types/types";
import { formatCurrency } from "@/lib/utils";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  InputAdornment,
  Snackbar,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

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

function parseBudgetInput(value: string) {
  const parsed = Number(value || 0);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

export default function BudgetsPage() {
  const { user, authLoading } = useAuth();
  const { categories } = useCategories(user, authLoading);
  const { accounts } = useAccounts(user, authLoading);
  const {
    selectedMonthKey: monthKey,
    setSelectedMonthKey: setMonthKey,
    budgetValues,
    setBudgetValue,
    saveBudget,
    copyPreviousMonth,
    isSaving,
    error,
  } = useBudget(user, authLoading);
  const isLoading = authLoading;

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isCurrentMonth = monthKey === getCurrentMonthKey();

  useEffect(() => {
    // clear success message when month changes
    setSuccessMessage(null);
  }, [monthKey]);

  function openPicker(event: React.MouseEvent<HTMLElement>) {
    // noop: handled by MonthPickerControl
  }

  function closePicker() {
    // noop: handled by MonthPickerControl
  }

  function selectMonthFromPicker(monthIndex: number) {
    // monthIndex is 0-based (0 = January)
    // noop: handled by MonthPickerControl
  }

  function goToPreviousMonth() {
    // noop: handled by MonthPickerControl
  }

  function goToNextMonth() {
    // noop: handled by MonthPickerControl
  }

  function goToCurrentMonth() {
    setMonthKey(getCurrentMonthKey());
  }

  const activeCategories = useMemo(
    () => categories.filter((category) => !category.isArchived),
    [categories]
  );

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.isArchived),
    [accounts]
  );

  const incomeCategories = useMemo(
    () => activeCategories.filter((category) => category.kind === "income"),
    [activeCategories]
  );

  const expenseCategories = useMemo(
    () => activeCategories.filter((category) => category.kind === "expense"),
    [activeCategories]
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
        items: incomeCategories.map((category) => ({
          id: `category_${category.id}`,
          label: category.name,
          value: budgetValues[`category_${category.id}`] ?? "0.00",
        })),
      },
      {
        title: "Expenses",
        description: "Planned monthly spending.",
        color: "#dc2626",
        background: "#fef2f2",
        items: expenseCategories.map((category) => ({
          id: `category_${category.id}`,
          label: category.name,
          value: budgetValues[`category_${category.id}`] ?? "0.00",
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
      incomeCategories,
      expenseCategories,
      assetAccounts,
      liabilityAccounts,
      budgetValues,
    ]
  );

  const summary = useMemo(() => {
    const income = incomeCategories.reduce((total, category) => {
      return total + parseBudgetInput(budgetValues[`category_${category.id}`]);
    }, 0);

    const expenses = expenseCategories.reduce((total, category) => {
      return total + parseBudgetInput(budgetValues[`category_${category.id}`]);
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
    incomeCategories,
    expenseCategories,
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

      for (const category of activeCategories) {
        const lineId = `cashflow_${category.id}`;

        lines[lineId] = {
          id: lineId,
          lineType: category.kind,
          categoryId: category.id,
          planned: parseBudgetInput(budgetValues[lineId]),
        };
      }

      for (const account of activeAccounts) {
        const lineId = `account_${account.id}`;

        lines[lineId] = {
          id: lineId,
          lineType: "transfer",
          categoryId: account.id,
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
            <MonthPickerControl
              monthKey={monthKey}
              onChange={setMonthKey}
              ariaLabelPrefix="Budgets "
            />

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