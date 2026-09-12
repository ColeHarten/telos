"use client";

import { auth } from "@/lib/firebaseClient";
import useAuth from "@/lib/hooks/useAuth";
import { useSettings } from "@/lib/hooks/useSettings";
import PageHeader from "@/components/PageHeader";
import type { DefaultBudgetMonth } from "@/lib/types/types";
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
import { useState } from "react";

export default function SettingsPage() {
  const router = useRouter();

  const { user, authLoading } = useAuth();
  const { settings, settingsLoading, error: loadError, updateSettings } = useSettings(user, authLoading);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  const displayedError = saveError ?? loadError;

  return (
    <Stack spacing={2.25} sx={{ p: 4 }}>
      <PageHeader title="Settings" />

      {displayedError && (
        <Snackbar
          open
          autoHideDuration={5000}
          onClose={() => setSaveError(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Alert
            severity="error"
            variant="filled"
            onClose={() => setSaveError(null)}
            sx={{ borderRadius: 2, fontWeight: 600 }}
          >
            {displayedError}
          </Alert>
        </Snackbar>
      )}

      {/* Account */}
      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <CardContent sx={{ p: 2.25 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              Account
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          {user ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "140px 1fr" }, gap: { xs: 0.25, sm: 2 } }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Display name
              </Typography>
              <Typography variant="body2">{user.displayName ?? "Not set"}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Email
              </Typography>
              <Typography variant="body2">{user.email}</Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Loading account...
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <CardContent sx={{ p: 2.25 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              Preferences
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          {settingsLoading || !settings ? (
            <Typography variant="body2" color="text.secondary">
              Loading preferences...
            </Typography>
          ) : (
            <Typography variant="h5">
              TBU
            </Typography>
          )}
        </CardContent>
      </Card>

      <Box>
        <Button
          color="error"
          variant="outlined"
          startIcon={<LogoutRoundedIcon />}
          onClick={handleSignOut}
          sx={{ height: 40, px: 3, borderRadius: 2, textTransform: "none", fontWeight: 700 }}
        >
          Sign Out
        </Button>
      </Box>
    </Stack>
  );
}