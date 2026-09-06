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
   * When set, this button re-opens Plaid Link in UPDATE mode for the given
   * existing item (e.g. one flagged needsReauth after an ITEM_LOGIN_REQUIRED
   * sync failure) instead of linking a brand-new account. Fetches its token
   * from create-update-link-token instead of create-link-token, and on
   * success skips exchange-token entirely — the item's access_token is
   * unchanged in update mode, only its credentials were refreshed, so
   * re-exchanging would be wrong. onSyncSuccess is still called, so the
   * caller can trigger a resync to clear needsReauth.
   */
  updateModeItemId?: string;
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
  isUpdateMode,
  onSyncSuccess,
  render,
  onStateChange,
}: {
  token: string;
  isUpdateMode: boolean;
  onSyncSuccess: () => void;
  render?: (props: PlaidLinkRenderProps) => React.ReactNode;
  onStateChange?: (props: PlaidLinkRenderProps) => void;
}) {
  // Use useMemo to ensure the config object doesn't change on re-renders
  const config = useMemo(() => ({
    token,
    onSuccess: async (public_token: string) => {
      if (!isUpdateMode) {
        await authenticatedFetch("/api/plaid/exchange-token", {
          method: "POST",
          body: JSON.stringify({ public_token }),
        });
      }
      // Update mode: the item's access_token is unchanged, only its
      // credentials were refreshed — nothing to exchange. onSyncSuccess is
      // the caller's cue to trigger a resync, which clears needsReauth.
      onSyncSuccess();
    },
  }), [token, isUpdateMode, onSyncSuccess]);

  const { open, ready } = usePlaidLink(config);

  const readyLabel = isUpdateMode ? "Reconnect account" : "Connect Bank Account";
  const triggerProps: PlaidLinkRenderProps = {
    onClick: () => open(),
    disabled: !ready,
    label: ready ? readyLabel : "Loading...",
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
    {ready ? readyLabel : "Loading..."}
    </Button>
  );
}

export function PlaidLinkButton({ onSyncSuccess, updateModeItemId, render, onStateChange }: PlaidLinkButtonProps) {
  const [token, setToken] = useState<string | null>(null);
  const isFetching = useRef(false);
  const isUpdateMode = Boolean(updateModeItemId);

  useEffect(() => {
    if (isFetching.current || token) return;
    isFetching.current = true;

    const fetchPromise = isUpdateMode
      ? authenticatedFetch("/api/plaid/create-update-link-token", {
          method: "POST",
          body: JSON.stringify({ itemId: updateModeItemId }),
        })
      : authenticatedFetch("/api/plaid/create-link-token", { method: "POST" });

    fetchPromise
      .then((res) => res.json())
      .then((data) => {
        if (data.linkToken) setToken(data.linkToken);
      })
      .catch(console.error);
  }, [token, isUpdateMode, updateModeItemId]);

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

  return (
    <PlaidLinkContent
      token={token}
      isUpdateMode={isUpdateMode}
      onSyncSuccess={onSyncSuccess}
      render={render}
      onStateChange={onStateChange}
    />
  );
}