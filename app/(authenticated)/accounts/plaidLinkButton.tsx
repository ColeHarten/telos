"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@mui/material";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

export type PlaidLinkRenderProps = {
  onClick: () => void;
  disabled: boolean;
  label: string;
};

type PlaidLinkButtonProps = {
  onSyncSuccess: () => void;
  /**
   * Optional custom renderer. Receives the real onClick/disabled/label state
   * so callers can present the trigger however they like (e.g. as a MenuItem
   * matching another option in the same menu) without duplicating any of the
   * token-fetching or Plaid Link logic below. If omitted, renders the default
   * standalone dark button.
   */
  render?: (props: PlaidLinkRenderProps) => React.ReactNode;
  /**
   * Optional callback fired (via effect, after render) whenever the
   * onClick/disabled/label state changes. Useful when this component needs
   * to stay mounted somewhere stable in the tree — e.g. outside a menu that
   * opens and closes — while some other, possibly transient, UI element
   * triggers it. Pair with render={() => null} to mount it invisibly.
   */
  onStateChange?: (props: PlaidLinkRenderProps) => void;
};

function PlaidLinkContent({
  token,
  onSyncSuccess,
  render,
  onStateChange,
}: {
  token: string;
  onSyncSuccess: () => void;
  render?: (props: PlaidLinkRenderProps) => React.ReactNode;
  onStateChange?: (props: PlaidLinkRenderProps) => void;
}) {
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

  const triggerProps: PlaidLinkRenderProps = {
    onClick: () => open(),
    disabled: !ready,
    label: ready ? "Connect Bank Account" : "Loading...",
  };

  useEffect(() => {
    onStateChange?.(triggerProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (render) {
    return <>{render(triggerProps)}</>;
  }

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

export function PlaidLinkButton({ onSyncSuccess, render, onStateChange }: PlaidLinkButtonProps) {
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

  const loadingProps: PlaidLinkRenderProps = { onClick: () => {}, disabled: true, label: "Loading..." };

  // Reports the loading state up while we don't have a token yet. Once a
  // token arrives, PlaidLinkContent below takes over reporting via its own
  // effect, keyed on the real `ready` state from usePlaidLink.
  useEffect(() => {
    if (!token) {
      onStateChange?.(loadingProps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // If token is null, render placeholder (either the custom render with a
  // disabled/loading state, or the default disabled button).
  if (!token) {
    if (render) {
      return <>{render(loadingProps)}</>;
    }
    return <Button disabled>Loading...</Button>;
  }

  return <PlaidLinkContent token={token} onSyncSuccess={onSyncSuccess} render={render} onStateChange={onStateChange} />;
}