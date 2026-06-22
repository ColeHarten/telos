"use client";

import { useEffect, useState } from "react";
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
  Stack,
  Typography,
} from "@mui/material";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseClient";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [defaultMonth, setDefaultMonth] = useState("current");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });

    return () => unsubscribe();
  }, []);

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
                  gap: '10px',
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
                  gap: '10px',
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

              <Stack spacing={2}>
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
                  <InputLabel>Currency</InputLabel>
                  <Select
                    label="Currency"
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
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
                    onChange={(event) => setDefaultMonth(event.target.value)}
                  >
                    <MenuItem value="current">Current Month</MenuItem>
                    <MenuItem value="next">Next Month</MenuItem>
                  </Select>
                </FormControl>

                <Typography variant="caption" color="text.secondary">
                  The default month to view when you open the app.
                </Typography>
              </Stack>
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
                  gap: '10px',
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

              <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
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