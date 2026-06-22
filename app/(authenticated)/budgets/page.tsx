"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";

type BudgetGroup = {
  title: string;
  description: string;
  color: string;
  background: string;
  items: {
    label: string;
    value: string;
  }[];
};

const budgetGroups: BudgetGroup[] = [
  {
    title: "Income",
    description: "Expected money coming in this month.",
    color: "#059669",
    background: "#ecfdf5",
    items: [
      { label: "Salary / Paycheck", value: "5000.00" },
      { label: "Bonus", value: "600.00" },
      { label: "Other Income", value: "300.00" },
    ],
  },
  {
    title: "Expenses",
    description: "Planned monthly spending.",
    color: "#dc2626",
    background: "#fef2f2",
    items: [
      { label: "Rent", value: "1800.00" },
      { label: "Groceries", value: "500.00" },
      { label: "Restaurants", value: "300.00" },
      { label: "Bars", value: "200.00" },
      { label: "Subscriptions", value: "150.00" },
    ],
  },
  {
    title: "Savings",
    description: "Planned contributions to savings and investing.",
    color: "#7c3aed",
    background: "#f5f3ff",
    items: [
      { label: "Retirement Savings", value: "700.00" },
      { label: "Emergency Fund", value: "300.00" },
      { label: "Brokerage / Investing", value: "150.00" },
    ],
  },
  {
    title: "Debt",
    description: "Planned debt payments and paydowns.",
    color: "#ea580c",
    background: "#fff7ed",
    items: [
      { label: "Student Loan Payment", value: "400.00" },
      { label: "Credit Card Debt Paydown", value: "200.00" },
    ],
  },
];

export default function BudgetsPage() {
  const [monthKey, setMonthKey] = useState("2026-06");

  const summary = useMemo(() => {
    const income = 5900;
    const expenses = 3450;
    const savings = 1150;
    const debt = 600;
    const remaining = income - expenses - savings - debt;

    return [
      { label: "Total Income", value: income, color: "#059669" },
      { label: "Total Expenses", value: expenses, color: "#dc2626" },
      { label: "Total Savings", value: savings, color: "#7c3aed" },
      { label: "Total Debt", value: debt, color: "#ea580c" },
      { label: "Remaining Cash Flow", value: remaining, color: "#059669" },
    ];
  }, []);

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

        <Stack
          spacing={2}
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TextField
            label="Budget month"
            type="month"
            size="small"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <CalendarMonthRoundedIcon sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              width: { xs: "100%", sm: 190 },
              bgcolor: "background.paper",
              "& .MuiOutlinedInput-root": {
                height: 40,
                borderRadius: 2,
              },
            }}
          />

          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: '10px',
            }}
          >
            <Button
              variant="outlined"
              startIcon={<ContentCopyRoundedIcon />}
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
              sx={{
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              Save Budget
            </Button>
          </Box>
        </Stack>
      </Stack>

      {budgetGroups.map((group) => (
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
              <Grid container spacing={2}>
                {group.items.map((item) => (
                  <Grid key={item.label} size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label={item.label}
                      type="number"
                      defaultValue={item.value}
                      size="small"
                      slotProps={{
                        htmlInput: {
                          min: 0,
                          step: 0.01,
                        },
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">$</InputAdornment>
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
            </Box>
          </CardContent>
        </Card>
      ))}

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
                    ${item.value.toLocaleString()}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Stack>
  );
}