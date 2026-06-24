"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@mui/material";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

function PlaidLinkContent({ token, onSyncSuccess }: { token: string; onSyncSuccess: () => void }) {
  // Use useMemo to ensure the config object doesn't change on re-renders
  const config = useMemo(() => ({
    token,
    onSuccess: async (public_token: string) => {
      await authenticatedFetch("/api/plaid/exchange-token", {
        method: "POST",
        body: JSON.stringify({ public_token }),
      });
      onSyncSuccess();
    },
  }), [token, onSyncSuccess]);

  const { open, ready } = usePlaidLink(config);

  return (
    <Button
    variant="contained"
    onClick={() => open()}
    disabled={!ready}
    startIcon={<AccountBalanceIcon />}
    sx={{
        textTransform: "none",
        fontWeight: 600,
        fontSize: "15px",
        padding: "10px 20px",
        borderRadius: "8px", // Plaid uses slightly softer, consistent rounding
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)", // Subtle lift
        backgroundColor: "#000000", // Plaid often uses dark, high-contrast buttons
        "&:hover": {
        backgroundColor: "#333333",
        },
        "&.Mui-disabled": {
        backgroundColor: "#e0e0e0",
        },
    }}
    >
    {ready ? "Connect Bank Account" : "Loading..."}
    </Button>
  );
}

export function PlaidLinkButton({ onSyncSuccess }: { onSyncSuccess: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const isFetching = useRef(false);

  useEffect(() => {
    if (isFetching.current || token) return;
    isFetching.current = true;

    authenticatedFetch("/api/plaid/create-link-token", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.linkToken) setToken(data.linkToken);
      })
      .catch(console.error);
  }, [token]);

  // If token is null, render placeholder. If token exists, render the stable content.
  return token ? (
    <PlaidLinkContent token={token} onSyncSuccess={onSyncSuccess} />
  ) : (
    <Button disabled>Loading...</Button>
  );
}