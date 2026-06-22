"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Snackbar,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebaseClient";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

type Currency = "USD";
type DefaultBudgetMonth = "current" | "next";

type AppSettings = {
  currency: Currency;
  defaultBudgetMonth: DefaultBudgetMonth;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [defaultMonth, setDefaultMonth] =
    useState<DefaultBudgetMonth>("current");

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setIsLoadingSettings(false);
        return;
      }

      try {
        await setDoc(
          doc(db, "users", nextUser.uid),
          {
            uid: nextUser.uid,
            email: nextUser.email,
            displayName: nextUser.displayName,
            photoURL: nextUser.photoURL,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (profileError) {
        console.error(profileError);
        setError("Could not update user profile.");
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    setIsLoadingSettings(true);

    const settingsRef = doc(db, "users", user.uid, "settings", "app");

    const unsubscribe = onSnapshot(
      settingsRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          const defaultSettings: AppSettings = {
            currency: "USD",
            defaultBudgetMonth: "current",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await setDoc(settingsRef, defaultSettings);

          setCurrency("USD");
          setDefaultMonth("current");
          setIsLoadingSettings(false);
          return;
        }

        const data = snapshot.data();

        setCurrency((data.currency ?? "USD") as Currency);
        setDefaultMonth(
          (data.defaultBudgetMonth ?? "current") as DefaultBudgetMonth
        );
        setIsLoadingSettings(false);
      },
      (settingsError) => {
        console.error(settingsError);
        setError("Could not load settings.");
        setIsLoadingSettings(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  async function handleSaveSettings(
    nextCurrency: Currency,
    nextDefaultMonth: DefaultBudgetMonth
  ) {
    if (!user) {
      setError("You must be signed in to update settings.");
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      setIsSavingSettings(true);

      await setDoc(
        doc(db, "users", user.uid, "settings", "app"),
        {
          currency: nextCurrency,
          defaultBudgetMonth: nextDefaultMonth,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSuccessMessage("Settings saved.");
    } catch (saveError) {
      console.error(saveError);
      setError("Could not save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleCurrencyChange(nextCurrency: Currency) {
    setCurrency(nextCurrency);
    await handleSaveSettings(nextCurrency, defaultMonth);
  }

  async function handleDefaultMonthChange(nextDefaultMonth: DefaultBudgetMonth) {
    setDefaultMonth(nextDefaultMonth);
    await handleSaveSettings(currency, nextDefaultMonth);
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  return (
    <Stack spacing={2.25}>
      <Box>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          Settings
        </Typography>
      </Box>

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
          flexDirection: { xs: "column", md: "row" },
          alignItems: "flex-start",
        }}
      >
        <Stack spacing={2} sx={{ width: "100%" }}>
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
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: "#eff6ff",
                    color: "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PersonRoundedIcon sx={{ fontSize: 20 }} />
                </Box>

                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  Account Information
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              {user ? (
                <Stack spacing={1.25}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "140px 1fr" },
                      gap: { xs: 0.25, sm: 2 },
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontWeight: 600 }}
                    >
                      Email
                    </Typography>

                    <Typography variant="body2">{user.email}</Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "140px 1fr" },
                      gap: { xs: 0.25, sm: 2 },
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontWeight: 600 }}
                    >
                      User ID
                    </Typography>

                    <Typography
                      variant="body2"
                      sx={{
                        wordBreak: "break-all",
                        color: "text.secondary",
                      }}
                    >
                      {user.uid}
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                <Alert severity="info">Loading account...</Alert>
              )}
            </CardContent>
          </Card>

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
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: "#f5f3ff",
                    color: "#7c3aed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TuneRoundedIcon sx={{ fontSize: 20 }} />
                </Box>

                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  Preferences
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              {isLoadingSettings ? (
                <Alert severity="info">Loading settings...</Alert>
              ) : (
                <Stack spacing={2}>
                  <FormControl
                    fullWidth
                    size="small"
                    disabled={isSavingSettings}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        height: 40,
                        borderRadius: 2,
                      },
                    }}
                  >
                    <InputLabel>Currency</InputLabel>
                    <Select
                      label="Currency"
                      value={currency}
                      onChange={(event) =>
                        handleCurrencyChange(event.target.value as Currency)
                      }
                    >
                      <MenuItem value="USD">USD - US Dollar</MenuItem>
                    </Select>
                  </FormControl>

                  <Typography variant="caption" color="text.secondary">
                    This is the currency used throughout the app.
                  </Typography>

                  <FormControl
                    fullWidth
                    size="small"
                    disabled={isSavingSettings}
                    sx={{
                      mt: 1,
                      "& .MuiOutlinedInput-root": {
                        height: 40,
                        borderRadius: 2,
                      },
                    }}
                  >
                    <InputLabel>Default budget month</InputLabel>
                    <Select
                      label="Default budget month"
                      value={defaultMonth}
                      onChange={(event) =>
                        handleDefaultMonthChange(
                          event.target.value as DefaultBudgetMonth
                        )
                      }
                    >
                      <MenuItem value="current">Current Month</MenuItem>
                      <MenuItem value="next">Next Month</MenuItem>
                    </Select>
                  </FormControl>

                  <Typography variant="caption" color="text.secondary">
                    The default month to view when you open the app.
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>

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
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: "#f8fafc",
                    color: "text.secondary",
                    border: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 20 }} />
                </Box>

                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  About
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Budgeting App v1.0.0
              </Typography>

              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ mt: 0.5 }}
              >
                A simple budgeting app to plan your financial future.
              </Typography>
            </CardContent>
          </Card>

          <Box>
            <Button
              color="error"
              variant="outlined"
              startIcon={<LogoutRoundedIcon />}
              onClick={handleSignOut}
              sx={{
                height: 40,
                px: 3,
                borderRadius: 2,
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              Sign Out
            </Button>
          </Box>
        </Stack>
      </Stack>
    </Stack>
  );
}