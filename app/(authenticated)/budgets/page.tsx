"use client";

import { auth, db } from "@/lib/firebaseClient";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
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
import { User, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type {
  CashflowKind,
  Cashflow,
  AccountType,
  NormalBalance,
  Account,
  BudgetLineType,
  BudgetLine,
  BudgetLines,
} from "@/lib/types";



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
  const [user, setUser] = useState<User | null>(null);
  const [monthKey, setMonthKey] = useState("2026-06");

  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setCashflows([]);
      setAccounts([]);
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);

    const cashflowsQuery = query(
      collection(db, "users", user.uid, "cashflows"),
      orderBy("sortOrder", "asc")
    );

    const accountsQuery = query(
      collection(db, "users", user.uid, "accounts"),
      orderBy("createdAt", "asc")
    );

    const unsubscribeCashflows = onSnapshot(
      cashflowsQuery,
      (snapshot) => {
        const nextCashflows = snapshot.docs.map((cashflowDoc) => {
          const data = cashflowDoc.data();

          return {
            id: cashflowDoc.id,
            name: data.name ?? "",
            kind: data.kind ?? "expense",
            sortOrder: Number(data.sortOrder ?? 0),
            isArchived: Boolean(data.isArchived ?? false),
          } as Cashflow;
        });

        setCashflows(nextCashflows);
        setIsLoadingData(false);
      },
      (cashflowError) => {
        console.error(cashflowError);
        setError("Could not load cashflows.");
        setIsLoadingData(false);
      }
    );

    const unsubscribeAccounts = onSnapshot(
      accountsQuery,
      (snapshot) => {
        const nextAccounts = snapshot.docs.map((accountDoc) => {
          const data = accountDoc.data();

          return {
            id: accountDoc.id,
            name: data.name ?? "",
            accountType: data.accountType ?? "cash",
            normalBalance: data.normalBalance ?? "asset",
            isArchived: Boolean(data.isArchived ?? false),
          } as Account;
        });

        setAccounts(nextAccounts);
        setIsLoadingData(false);
      },
      (accountError) => {
        console.error(accountError);
        setError("Could not load accounts.");
        setIsLoadingData(false);
      }
    );

    return () => {
      unsubscribeCashflows();
      unsubscribeAccounts();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setBudgetValues({});
      setIsLoadingBudget(false);
      return;
    }

    setIsLoadingBudget(true);

    const budgetRef = doc(db, "users", user.uid, "budgets", monthKey);

    const unsubscribe = onSnapshot(
      budgetRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setBudgetValues({});
          setIsLoadingBudget(false);
          return;
        }

        const data = snapshot.data();
        const lines = (data.lines ?? {}) as BudgetLines;

        const nextBudgetValues: Record<string, string> = {};

        for (const [lineId, line] of Object.entries(lines)) {
          nextBudgetValues[lineId] = String(line.planned ?? 0);
        }

        setBudgetValues(nextBudgetValues);
        setIsLoadingBudget(false);
      },
      (budgetError) => {
        console.error(budgetError);
        setError("Could not load budget.");
        setIsLoadingBudget(false);
      }
    );

    return () => unsubscribe();
  }, [user, monthKey]);

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
    setBudgetValues((currentValues) => ({
      ...currentValues,
      [lineId]: nextValue,
    }));
  }

  async function handleSaveBudget() {
    if (!user) {
      setError("You must be signed in to save a budget.");
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      setIsSavingBudget(true);

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

      await setDoc(
        doc(db, "users", user.uid, "budgets", monthKey),
        {
          monthKey,
          currency: "USD",
          lines,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSuccessMessage("Budget saved.");
    } catch (saveError) {
      console.error(saveError);
      setError("Could not save budget.");
    } finally {
      setIsSavingBudget(false);
    }
  }

  async function handleCopyPreviousMonth() {
    if (!user) {
      setError("You must be signed in to copy a budget.");
      return;
    }

    const [year, month] = monthKey.split("-").map(Number);
    const previousMonthDate = new Date(year, month - 2, 1);
    const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(
      previousMonthDate.getMonth() + 1
    ).padStart(2, "0")}`;

    try {
      setError(null);
      setSuccessMessage(null);

      const previousBudgetSnapshot = await getDoc(
        doc(db, "users", user.uid, "budgets", previousMonthKey)
      );

      if (!previousBudgetSnapshot.exists()) {
        setError(`No budget found for ${previousMonthKey}.`);
        return;
      }

      const previousBudget = previousBudgetSnapshot.data();
      const previousLines = (previousBudget.lines ?? {}) as BudgetLines;

      const copiedValues: Record<string, string> = {};

      for (const [lineId, line] of Object.entries(previousLines)) {
        copiedValues[lineId] = String(line.planned ?? 0);
      }

      setBudgetValues(copiedValues);
      setSuccessMessage(`Copied budget from ${previousMonthKey}.`);
    } catch (copyError) {
      console.error(copyError);
      setError("Could not copy previous month.");
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
          open={(!error|| !successMessage)}
          autoHideDuration={5000}
          onClose={error ? () => setError(null) : () => setSuccessMessage(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Alert
            severity={error ? "error" : "success"}
            variant="filled"
            onClose={error ? () => setError(null) : () => setSuccessMessage(null)}
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
              gap: "10px",
            }}
          >
            <Button
              variant="outlined"
              startIcon={<ContentCopyRoundedIcon />}
              onClick={handleCopyPreviousMonth}
              disabled={isLoadingData || isLoadingBudget || isSavingBudget}
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
              disabled={isLoadingData || isLoadingBudget || isSavingBudget}
              sx={{
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {isSavingBudget ? "Saving..." : "Save Budget"}
            </Button>
          </Box>
        </Stack>
      </Stack>

      {isLoadingData || isLoadingBudget ? (
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
    </Stack>
  );
}