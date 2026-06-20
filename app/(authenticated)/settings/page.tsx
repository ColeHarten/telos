"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseClient";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

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
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">
          Settings
        </Typography>
        <Typography color="text.secondary">
          Manage your account and budgeting preferences.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6">
            Account
          </Typography>

          <Divider sx={{ my: 2 }} />

          {user ? (
            <Stack spacing={1}>
              <Typography>
                <strong>Email:</strong> {user.email}
              </Typography>
              <Typography>
                <strong>User ID:</strong> {user.uid}
              </Typography>
            </Stack>
          ) : (
            <Alert severity="info">Loading account...</Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">
            Preferences
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Typography>
            <strong>Currency:</strong> USD
          </Typography>
        </CardContent>
      </Card>

      <Box>
        <Button color="error" variant="outlined" onClick={handleSignOut}>
          Sign out
        </Button>
      </Box>
    </Stack>
  );
}