"use client";

import { auth } from "@/lib/firebaseClient";
import useAuth from "@/lib/hooks/useAuth";
import useBudget from "@/lib/hooks/useBudget";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  const { user } = useAuth();
  const { settings, updateSettings, ensureUserProfile } = useBudget(user, false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [defaultMonth, setDefaultMonth] =
    useState<DefaultBudgetMonth>("current");
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        await ensureUserProfile();
      } catch (err) {
        console.error(err);
      }
    })();
  }, [user, ensureUserProfile]);

  useEffect(() => {
    if (!settings) return;
    setCurrency(settings.currency);
    setDefaultMonth(settings.defaultBudgetMonth);
    setIsLoadingSettings(false);
  }, [settings]);

  async function handleSaveSettings(
    nextCurrency: Currency,
    nextDefaultMonth: DefaultBudgetMonth
  ) {
    try {
      setError(null);
      setSuccessMessage(null);
      setIsSavingSettings(true);

      await updateSettings({
        currency: nextCurrency,
        defaultBudgetMonth: nextDefaultMonth,
      });

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
          open={Boolean(error || successMessage)}
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
                      disabled={true}
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
                      disabled={true}
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
                Telos v1.0.0
              </Typography>

              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ mt: 0.5 }}
              >
                Money with purpose.
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