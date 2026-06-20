"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

const budgetGroups = [
  {
    title: "Income",
    items: ["Salary / Paycheck", "Bonus", "Other Income"],
  },
  {
    title: "Expenses",
    items: ["Rent", "Groceries", "Restaurants", "Bars", "Subscriptions"],
  },
  {
    title: "Savings",
    items: ["Retirement Savings", "Emergency Fund", "Brokerage / Investing"],
  },
  {
    title: "Debt",
    items: ["Student Loan Payment", "Credit Card Debt Paydown"],
  },
];

export default function BudgetsPage() {
  const [monthKey, setMonthKey] = useState("2026-06");

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">
          Budgets
        </Typography>
        <Typography color="text.secondary">
          Plan your projected monthly income and outflows.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              alignItems: { xs: "stretch", sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <TextField
              label="Budget month"
              type="month"
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value)}
              sx={{ maxWidth: 240 }}
            />

            <Stack direction="row" spacing={1}>
              <Button variant="outlined">Copy Previous Month</Button>
              <Button variant="contained">Save Budget</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {budgetGroups.map((group) => (
        <Card key={group.title}>
          <CardContent>
            <Typography variant="h6">
              {group.title}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              {group.items.map((item) => (
                <Grid  key={item} size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label={item}
                    type="number"
                    placeholder="0.00"
                    slotProps={{
                      htmlInput: {
                        min: 0,
                        step: 0.01,
                      },
                    }}
                  />
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}