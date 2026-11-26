"use client";

import PageHeader from "@/components/PageHeader";
import usePlaidAccountLink from "@/lib/hooks/usePlaidAccountLink";
import { readLinkSession, type SavedLinkSession } from "@/lib/plaidLinkState";
import { Alert, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LinkConfirmDialog } from "../accounts/plaidLinkButton";

const backButtonSx = { textTransform: "none", fontWeight: 700, alignSelf: "flex-start" } as const;

/** Reopens Link with the saved token after an OAuth bank sends the user back. */
function ResumeLink({ session }: { session: SavedLinkSession }) {
  const router = useRouter();
  const [receivedRedirectUri] = useState(() => (typeof window === "undefined" ? "" : window.location.href));
  const [error, setError] = useState<string | null>(null);

  const backToAccounts = () => router.push("/accounts");

  const link = usePlaidAccountLink({
    updateModeItemId: session.updateModeItemId ?? undefined,
    accountSelection: session.accountSelection,
    resume: { token: session.token, receivedRedirectUri },
    onAccountsLinked: backToAccounts,
    onUpdateComplete: backToAccounts,
    onExit: backToAccounts,
    onLinkError: setError,
  });

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
      {error ? (
        <Stack spacing={2}>
          <Alert severity="error" sx={{ borderRadius: 2.5 }}>
            {error}
          </Alert>
          <Button onClick={backToAccounts} sx={backButtonSx}>
            Back to Accounts
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ color: "#334155" }}>
              Finishing your bank connection...
            </Typography>
          </Stack>
          <Button onClick={backToAccounts} disabled={link.finishing} sx={backButtonSx}>
            Back to Accounts
          </Button>
        </Stack>
      )}

      <LinkConfirmDialog
        link={{
          ...link,
          cancelConfirmation: () => {
            link.cancelConfirmation();
            backToAccounts();
          },
        }}
      />
    </Paper>
  );
}

/**
 * Plaid's OAuth redirect lands here (PLAID_REDIRECT_URI). The link token was
 * saved before Link opened; without it, the connection has to start again.
 */
export default function OAuthPage() {
  const [session] = useState<SavedLinkSession | null>(() => readLinkSession());

  return (
    <Stack spacing={3} sx={{ p: 4, bgcolor: "#f8fafc", minHeight: "100vh" }}>
      <PageHeader title="Connecting your bank" />
      {session ? (
        <ResumeLink session={session} />
      ) : (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: "#fff", borderColor: "#e2e8f0" }}>
          <Stack spacing={2}>
            <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
              This bank connection can&apos;t be resumed in this browser. Start it again from Accounts.
            </Alert>
            <Button href="/accounts" sx={backButtonSx}>
              Back to Accounts
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
