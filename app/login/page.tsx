"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import GoogleIcon from "@mui/icons-material/Google";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

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
    <Container maxWidth="sm">
      <Box
       sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
       }}
      >
        <Card sx={{ width: "100%" }}>
          <CardContent>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h4">
                  Budgeting
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  Sign in to manage your monthly budget.
                </Typography>
              </Box>

              {error && <Alert severity="error">{error}</Alert>}

              <Button
                size="large"
                variant="contained"
                startIcon={<GoogleIcon />}
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
              >
                {isSigningIn ? "Signing in..." : "Sign in with Google"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}