"use client";

import { auth } from "@/lib/firebaseClient";
import GoogleIcon from "@mui/icons-material/Google";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

function PiggyBankIcon({
  size = 40,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18.5 25.5C21.8 20.7 27.5 18 34.5 18H40.5C50.2 18 57 24.1 57 32.8C57 38.7 53.7 43.8 48.5 46.3V54H39.5V49.2C38.2 49.4 36.8 49.5 35.3 49.5H30.8C29.3 49.5 27.9 49.4 26.5 49.1V54H17.5V45.9C13.7 43.8 11 40.5 10 36.5H5V27.5H10.2C11.1 24.7 12.8 22.2 15.1 20.2C14.5 17.9 14.8 15.5 16.1 13.5C16.5 12.9 17.3 12.8 17.9 13.2L24.5 17.3"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29 14H41"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M45.5 29.5H45.55"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M27 23.5C29.2 22.5 31.7 22 34.5 22"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleGoogleSignIn() {
    try {
      setError(null);
      setIsSigningIn(true);

      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Could not sign in with Google.");
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        bgcolor: "#f8fbff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 20%, rgba(37, 99, 235, 0.10), transparent 28%), radial-gradient(circle at 80% 25%, rgba(16, 185, 129, 0.10), transparent 26%), linear-gradient(180deg, #ffffff 0%, #f3f8ff 100%)",
          zIndex: 0,
        }}
      />

      <Box
        sx={{
          position: "absolute",
          left: "-8%",
          bottom: "-18%",
          width: "44%",
          height: "38%",
          bgcolor: "rgba(37, 99, 235, 0.10)",
          borderRadius: "50%",
          filter: "blur(8px)",
          zIndex: 0,
        }}
      />

      <Box
        sx={{
          position: "absolute",
          right: "-10%",
          bottom: "-20%",
          width: "48%",
          height: "42%",
          bgcolor: "rgba(16, 185, 129, 0.12)",
          borderRadius: "50%",
          filter: "blur(8px)",
          zIndex: 0,
        }}
      />

      <Container maxWidth="sm" sx={{ position: "relative", zIndex: 1 }}>
        <Card
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 420,
            mx: "auto",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 4,
            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.10)",
            bgcolor: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(12px)",
          }}
        >
          <CardContent sx={{ p: { xs: 4, sm: 5 } }}>
            <Stack sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                  color: "white",
                  boxShadow: "0 16px 36px rgba(37, 99, 235, 0.30)",
                }}
              >
                {/* <AccountBalanceWalletRoundedIcon sx={{ fontSize: 38 }} /> */}
                <PiggyBankIcon size={38} color="white" />
              </Box>

              <Box sx={{
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}>
                <Typography
                  variant="h3"
                  sx={{
                    fontSize: { xs: "2rem", sm: "2.25rem" },
                    letterSpacing: "-0.04em",
                    color: "grey.900",
                  }}
                >
                  Budgeting
                </Typography>

                <Typography
                  color="text.secondary"
                  sx={{
                    maxWidth: 300,
                    lineHeight: 1.6,
                  }}
                >
                  Plan your income, expenses, savings, and debt payments each
                  month.
                </Typography>
              </Box>

              {error && (
                <Alert severity="error" sx={{ width: "100%", textAlign: "left" }}>
                  {error}
                </Alert>
              )}

              <Button
                fullWidth
                size="large"
                variant="contained"
                startIcon={<GoogleIcon />}
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                sx={{
                  py: 1.35,
                  borderRadius: 2,
                  textTransform: "none",
                  fontWeight: 700,
                  boxShadow: "0 12px 24px rgba(37, 99, 235, 0.25)",
                }}
              >
                {isSigningIn ? "Signing in..." : "Sign in with Google"}
              </Button>

              <Stack
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "text.secondary",
                  gap: 0.5,}}
              >
                <LockOutlinedIcon sx={{ fontSize: 12 }} />
                <Typography variant="caption">
                  Your data is private and secure
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}