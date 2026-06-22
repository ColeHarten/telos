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
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";

const initialAccounts = [
  {
    name: "Checking Account",
    accountType: "cash",
    balance: "$4,250",
    status: "Active",
  },
  {
    name: "High-Yield Savings",
    accountType: "cash",
    balance: "$12,000",
    status: "Active",
  },
  {
    name: "Credit Card",
    accountType: "credit_card",
    balance: "$1,150",
    status: "Active",
  },
  {
    name: "Brokerage",
    accountType: "investment",
    balance: "$8,500",
    status: "Active",
  },
  {
    name: "401(k)",
    accountType: "retirement",
    balance: "$35,000",
    status: "Active",
  },
  {
    name: "Student Loan",
    accountType: "loan",
    balance: "$18,000",
    status: "Active",
  },
];

const accountTypeStyles: Record<
  string,
  {
    label: string;
    color: string;
    background: string;
    icon: typeof AccountBalanceRoundedIcon;
  }
> = {
  cash: {
    label: "Cash",
    color: "#059669",
    background: "#ecfdf5",
    icon: AccountBalanceRoundedIcon,
  },
  credit_card: {
    label: "Credit Card",
    color: "#dc2626",
    background: "#fef2f2",
    icon: CreditCardRoundedIcon,
  },
  investment: {
    label: "Investment",
    color: "#2563eb",
    background: "#eff6ff",
    icon: ShowChartRoundedIcon,
  },
  retirement: {
    label: "Retirement",
    color: "#7c3aed",
    background: "#f5f3ff",
    icon: SavingsRoundedIcon,
  },
  loan: {
    label: "Loan",
    color: "#ea580c",
    background: "#fff7ed",
    icon: SchoolRoundedIcon,
  },
};

export default function AccountsPage() {
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("cash");

  return (
    <Stack spacing={2.25}>
      <Stack
        spacing={2}
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
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
            Accounts
          </Typography>
        </Box>
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
        <CardContent sx={{ p: 2.25 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 700,
              mb: 1.75,
            }}
          >
            Add Account
          </Typography>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField
                fullWidth
                size="small"
                label="Account name"
                placeholder="e.g., Chase Checking"
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 40,
                    borderRadius: 2,
                  },
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
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
                <InputLabel>Account type</InputLabel>
                <Select
                    label="Account type"
                    value={newAccountType}
                    onChange={(event) => setNewAccountType(event.target.value)}
                >
                    <MenuItem value="cash">Cash</MenuItem>
                    <MenuItem value="credit_card">Credit Card</MenuItem>
                    <MenuItem value="investment">Investment</MenuItem>
                    <MenuItem value="retirement">Retirement</MenuItem>
                    <MenuItem value="loan">Loan</MenuItem>
                    <MenuItem value="property">Property</MenuItem>
                    <MenuItem value="other_asset">Other Asset</MenuItem>
                    <MenuItem value="other_liability">Other Liability</MenuItem>
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
            Your Accounts
          </Typography>
        </Box>

        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: { xs: "none", md: "grid" },
              gridTemplateColumns: "1fr 160px 140px 120px 96px",
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
              Account
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
              Balance
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

          {initialAccounts.map((account, index) => {
            const style = accountTypeStyles[account.accountType];
            const Icon = style.icon;

            return (
              <Box key={account.name}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      md: "1fr 160px 140px 120px 96px",
                    },
                    gap: { xs: 1, md: 0 },
                    alignItems: "center",
                    px: 2.25,
                    py: { xs: 1.5, md: 1 },
                    minHeight: { md: 48 },
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
                        width: 32,
                        height: 32,
                        borderRadius: 2,
                        bgcolor: style.background,
                        color: style.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon sx={{ fontSize: 18 }} />
                    </Box>

                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {account.name}
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

                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {account.balance}
                  </Typography>

                  <Box>
                    <Chip
                      label={account.status}
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
                      aria-label={`Edit ${account.name}`}
                      sx={{
                        color: "text.secondary",
                      }}
                    >
                      <EditRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    <IconButton
                      size="small"
                      aria-label={`Archive ${account.name}`}
                      sx={{
                        color: "#dc2626",
                      }}
                    >
                      <ArchiveRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Stack>
                </Box>

                {index < initialAccounts.length - 1 && <Divider />}
              </Box>
            );
          })}
        </CardContent>
      </Card>
    </Stack>
  );
}