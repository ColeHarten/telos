"use client";

import { auth, db } from "@/lib/firebaseClient";
import { buildTransactionsCsv, toExportTransaction, type ExportTransaction } from "@/lib/exportCsv";
import useAuth from "@/lib/hooks/useAuth";
import { useSettings } from "@/lib/hooks/useSettings";
import PageHeader from "@/components/PageHeader";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SettingsPage() {
  const router = useRouter();

  const { user, authLoading } = useAuth();
  // Also creates the user's settings doc on first visit.
  const { error: loadError } = useSettings(user, authLoading);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Every transaction as a CSV file, with account and category names.
  async function handleExport() {
    if (!user) return;
    setExporting(true);
    try {
      const [transactionSnap, accountSnap, categorySnap] = await Promise.all([
        getDocs(collection(db, "users", user.uid, "transactions")),
        getDocs(collection(db, "users", user.uid, "accounts")),
        getDocs(collection(db, "users", user.uid, "categories")),
      ]);
      const names = (docs: typeof accountSnap.docs) =>
        new Map(docs.map((d): [string, string] => [d.id, typeof d.data().name === "string" ? d.data().name : ""]));
      const rows = transactionSnap.docs.flatMap((d): ExportTransaction[] => {
        const row = toExportTransaction(d.id, d.data());
        return row ? [row] : [];
      });
      const csv = buildTransactionsCsv(rows, { accounts: names(accountSnap.docs), categories: names(categorySnap.docs) });

      const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `telos-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (exportError) {
      console.error(exportError);
      setSaveError("Could not export transactions.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  const displayedError = saveError ?? loadError;

  return (
    <Stack spacing={3}>
      <PageHeader title="Settings" />

      {displayedError && (
        <Snackbar
          open
          autoHideDuration={5000}
          onClose={() => setSaveError(null)}
        >
          <Alert severity="error" variant="filled" onClose={() => setSaveError(null)}>
            {displayedError}
          </Alert>
        </Snackbar>
      )}

      {/* Account */}
      <Card>
        <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: "#eff6ff",
                color: "primary.main",
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
            <Stack spacing={0.5}>
              <Skeleton width={240} />
              <Skeleton width={200} />
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: "#ecfdf5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DownloadRoundedIcon sx={{ fontSize: 20 }} />
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              Export
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary">
            Download every transaction as a CSV file, with account and category names. Money in is positive.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadRoundedIcon />}
            onClick={handleExport}
            disabled={!user || exporting}
            sx={{ mt: 2 }}
          >
            {exporting ? "Preparing…" : "Export transactions (CSV)"}
          </Button>
        </CardContent>
      </Card>

      <Box>
        <Button
          color="error"
          variant="outlined"
          startIcon={<LogoutRoundedIcon />}
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </Box>
    </Stack>
  );
}