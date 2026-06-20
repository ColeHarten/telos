"use client";

import Link from "next/link";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LocalGroceryStoreRoundedIcon from "@mui/icons-material/LocalGroceryStoreRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import LocalBarRoundedIcon from "@mui/icons-material/LocalBarRounded";
import SubscriptionsRoundedIcon from "@mui/icons-material/SubscriptionsRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";

const summaryCards = [
  {
    label: "Projected Income",
    value: "$5,900",
    color: "#059669",
    background: "#ecfdf5",
  },
  {
    label: "Projected Expenses",
    value: "$3,450",
    color: "#dc2626",
    background: "#fef2f2",
  },
  {
    label: "Projected Savings",
    value: "$1,150",
    color: "#7c3aed",
    background: "#f5f3ff",
  },
  {
    label: "Projected Debt Payments",
    value: "$600",
    color: "#ea580c",
    background: "#fff7ed",
  },
  {
    label: "Projected Remaining Cash Flow",
    value: "$700",
    color: "#059669",
    background: "#ecfdf5",
  },
];

const topExpenses = [
  {
    label: "Rent",
    value: "$1,800",
    icon: HomeRoundedIcon,
  },
  {
    label: "Groceries",
    value: "$500",
    icon: LocalGroceryStoreRoundedIcon,
  },
  {
    label: "Restaurants",
    value: "$300",
    icon: RestaurantRoundedIcon,
  },
  {
    label: "Bars",
    value: "$200",
    icon: LocalBarRoundedIcon,
  },
  {
    label: "Subscriptions",
    value: "$150",
    icon: SubscriptionsRoundedIcon,
  },
];

const breakdown = [
  {
    label: "Expenses",
    value: "58.5%",
    color: "#ef4444",
  },
  {
    label: "Savings",
    value: "19.5%",
    color: "#8b5cf6",
  },
  {
    label: "Debt",
    value: "10.2%",
    color: "#f59e0b",
  },
  {
    label: "Remaining",
    value: "11.8%",
    color: "#10b981",
  },
];

export default function DashboardPage() {
  return (
    <Stack spacing={3}>
      <Stack
        spacing={2}
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Overview
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Your projected budget for the selected month.
          </Typography>
        </Box>

        <Chip
          icon={<CalendarMonthRoundedIcon />}
          label="June 2026"
          variant="outlined"
          sx={{
            height: 40,
            px: 1,
            borderRadius: 2,
            bgcolor: "background.paper",
            fontWeight: 600,
          }}
        />
      </Stack>

      <Grid container spacing={2}>
        {summaryCards.map((card) => (
          <Grid
            key={card.label}
            size={{
              xs: 12,
              sm: 6,
              md: card.label.includes("Remaining") ? 6 : 4,
            }}
          >
            <Card
              elevation={0}
              sx={{
                height: "100%",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                bgcolor: "background.paper",
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Stack spacing={1}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontWeight: 600 }}
                  >
                    {card.label}
                  </Typography>

                  <Typography
                    variant="h4"
                    sx={{
                      color: card.color,
                      fontWeight: 800,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {card.value}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
              height: "100%",
            }}
          >
            <CardContent sx={{ p: '20px' }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Budget Breakdown
              </Typography>

              <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                Planned allocation across your month.
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: '20px',
                  mt: 3,
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                <Box
                  sx={{
                    width: 150,
                    height: 150,
                    borderRadius: "50%",
                    background:
                      "conic-gradient(#ef4444 0deg 211deg, #8b5cf6 211deg 281deg, #f59e0b 281deg 318deg, #10b981 318deg 360deg)",
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 32,
                      borderRadius: "50%",
                      bgcolor: "background.paper",
                    }}
                  />
                </Box>

                <Box sx={{ 
                  display: "flex",
                  flexDirection: "column",
                  gap: '10px',
                  width: '100%',
                 }}>
                  {breakdown.map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: '10px'
                        }}
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            bgcolor: item.color,
                          }}
                        />

                        <Typography variant="body2">{item.label}</Typography>
                      </Box>

                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {item.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card
            elevation={0}
            sx={{
              height: "100%",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              bgcolor: "background.paper",
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Top Planned Expenses
                  </Typography>

                  <Typography
                    color="text.secondary"
                    variant="body2"
                    sx={{ mt: 0.5 }}
                  >
                    Your largest budgeted categories.
                  </Typography>
                </Box>

                <Divider />

                <Stack spacing={1.25}>
                  {topExpenses.map((expense) => {
                    const Icon = expense.icon;

                    return (
                      <Box
                        key={expense.label}
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "center",
                            alignContent: "center",
                            gap: '10px'
                          }}
                        >
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: 2,
                              bgcolor: "#f8fafc",
                              border: "1px solid",
                              borderColor: "divider",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "text.secondary",
                            }}
                          >
                            <Icon sx={{ fontSize: 18 }} />
                          </Box>

                          <Typography variant="body2">{expense.label}</Typography>
                        </Box>

                        <Typography variant="body2">{expense.value}</Typography>
                      </Box>
                    );
                  })}
                </Stack>

                <Button
                  component={Link}
                  href="/budgets"
                  variant="contained"
                  endIcon={<ArrowForwardRoundedIcon />}
                  sx={{
                    mt: 1,
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 700,
                  }}
                >
                  View all in Budgets
                </Button>
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
          bgcolor: "#f8fbff",
        }}
      >
        <CardContent sx={{ py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            You’re projected to end the month with{" "}
            <Box component="span" sx={{ color: "#059669", fontWeight: 700 }}>
              $700
            </Box>{" "}
            remaining cash flow.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}