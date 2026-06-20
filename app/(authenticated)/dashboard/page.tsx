"use client";

import {
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
  Button,
} from "@mui/material";
import Link from "next/link";

const summaryCards = [
  { label: "Projected Income", value: "$0" },
  { label: "Projected Expenses", value: "$0" },
  { label: "Projected Savings", value: "$0" },
  { label: "Debt Payments", value: "$0" },
  { label: "Remaining Cash Flow", value: "$0" },
];

export default function DashboardPage() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">
          Dashboard
        </Typography>
        <Typography color="text.secondary">
          Your monthly budget summary will appear here.
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {summaryCards.map((card) => (
          <Grid key={card.label} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  {card.label}
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

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
            <Box>
              <Typography variant="h6">
                Start planning this month
              </Typography>
              <Typography color="text.secondary">
                Create or edit your projected income, expenses, savings, and
                debt payments.
              </Typography>
            </Box>

            <Button
              component={Link}
              href="/budgets"
              variant="contained"
              sx={{ alignSelf: { xs: "stretch", sm: "center" } }}
            >
              Open Budget
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}