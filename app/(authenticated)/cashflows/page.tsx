"use client";

import { useState } from "react";
import {
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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";

const initialCashflows = [
  { name: "Salary / Paycheck", kind: "income", status: "Active" },
  { name: "Bonus", kind: "income", status: "Active" },
  { name: "Interest Income", kind: "income", status: "Active" },
  { name: "Reimbursement", kind: "income", status: "Active" },
  { name: "Other Income", kind: "income", status: "Active" },

  { name: "Rent", kind: "expense", status: "Active" },
  { name: "Utilities", kind: "expense", status: "Active" },
  { name: "Internet", kind: "expense", status: "Active" },
  { name: "Phone", kind: "expense", status: "Active" },
  { name: "Groceries", kind: "expense", status: "Active" },
  { name: "Restaurants", kind: "expense", status: "Active" },
  { name: "Bars", kind: "expense", status: "Active" },
  { name: "Coffee", kind: "expense", status: "Active" },
  { name: "Subscriptions", kind: "expense", status: "Active" },
  { name: "Shopping", kind: "expense", status: "Active" },
  { name: "Travel", kind: "expense", status: "Active" },
  { name: "Entertainment", kind: "expense", status: "Active" },
  { name: "Fitness", kind: "expense", status: "Active" },
  { name: "Medical", kind: "expense", status: "Active" },
  { name: "Insurance", kind: "expense", status: "Active" },
];

const cashflowStyles: Record<
  string,
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
  const [newCashflowName, setNewCashflowName] = useState("");
  const [newCashflowKind, setNewCashflowKind] = useState("expense");

  const incomeCount = initialCashflows.filter(
    (cashflow) => cashflow.kind === "income"
  ).length;

  const expenseCount = initialCashflows.filter(
    (cashflow) => cashflow.kind === "expense"
  ).length;

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
            Add Cashflow
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
                  onChange={(event) => setNewCashflowKind(event.target.value)}
                >
                  <MenuItem value="income">Income</MenuItem>
                  <MenuItem value="expense">Expense</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <Button
                fullWidth
                variant="contained"
                sx={{
                  height: 40,
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                Add
              </Button>
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

          {initialCashflows.map((cashflow, index) => {
            const style = cashflowStyles[cashflow.kind];
            const Icon = style.icon;

            return (
              <Box key={cashflow.name}>
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
                      gap: '10px',
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
                      label={cashflow.status}
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

                  <Stack
                    spacing={0.5}
                    sx={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: { xs: "flex-start", md: "flex-end" },
                    }}
                  >
                    <IconButton
                      size="small"
                      aria-label={`Edit ${cashflow.name}`}
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      <EditRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    <IconButton
                      size="small"
                      aria-label={`Archive ${cashflow.name}`}
                      sx={{
                        color: "#dc2626",
                      }}
                    >
                      <ArchiveRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Stack>
                </Box>

                {index < initialCashflows.length - 1 && <Divider />}
              </Box>
            );
          })}
        </CardContent>
      </Card>
    </Stack>
  );
}