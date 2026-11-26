"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { usePlaidLink } from "react-plaid-link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PlaidAccountLinkTrigger = {
  onClick: () => void;
  disabled: boolean;
  label: string;
};

type LinkedAccount = { id: string; name: string; accountType: string };

type PlaidAccountLinkOptions = {
  updateModeItemId?: string;
  onSyncSuccess?: () => void;
  onAccountsLinked?: (accounts: LinkedAccount[], skippedDuplicateCount: number) => void;
  onLinkError?: (message: string) => void;
};

// API routes return { error, message } on failure; message is safe to show.
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === "string" && body.message ? body.message : fallback;
}

async function fetchLinkToken(updateModeItemId: string | undefined): Promise<string> {
  const res = updateModeItemId
    ? await authenticatedFetch("/api/plaid/create-update-link-token", {
        method: "POST",
        body: JSON.stringify({ itemId: updateModeItemId }),
      })
    : await authenticatedFetch("/api/plaid/create-link-token", { method: "POST" });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `Link token request failed with status ${res.status}`));
  }

  const data = (await res.json()) as { linkToken?: unknown };
  if (typeof data.linkToken !== "string" || !data.linkToken) {
    throw new Error("No link token returned.");
  }
  return data.linkToken;
}

/**
 * Opens Plaid Link. The link token is requested when the button is clicked,
 * not when the page loads, and is dropped when Link closes, so every session
 * starts with a fresh token and idle pages make no requests.
 */
export default function usePlaidAccountLink(options: PlaidAccountLinkOptions): PlaidAccountLinkTrigger {
  const { updateModeItemId } = options;
  const isUpdateMode = Boolean(updateModeItemId);

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Set by a click; Link opens as soon as its token is ready.
  const openRequested = useRef(false);

  // The latest callbacks, read when they fire, so inline callbacks from the
  // caller don't rebuild the Link config every render.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const requestToken = useCallback(() => {
    setLoading(true);
    setFailed(false);
    fetchLinkToken(updateModeItemId)
      .then(setToken)
      .catch((error: unknown) => {
        console.error(error);
        openRequested.current = false;
        setFailed(true);
        callbacks.current.onLinkError?.("Could not prepare the bank connection.");
      })
      .finally(() => setLoading(false));
  }, [updateModeItemId]);

  const config = useMemo(
    () => ({
      token: token ?? "",
      onSuccess: async (publicToken: string) => {
        setToken(null);
        const { onAccountsLinked, onLinkError, onSyncSuccess } = callbacks.current;

        if (!isUpdateMode) {
          try {
            const res = await authenticatedFetch("/api/plaid/exchange-token", {
              method: "POST",
              body: JSON.stringify({ public_token: publicToken }),
            });

            if (!res.ok) {
              onLinkError?.(await readErrorMessage(res, "Could not link this account."));
              return;
            }

            const data = (await res.json()) as { accounts?: LinkedAccount[]; skippedDuplicateCount?: number };
            onAccountsLinked?.(data.accounts ?? [], data.skippedDuplicateCount ?? 0);
          } catch (error) {
            console.error(error);
            onLinkError?.("Could not link this account.");
            return;
          }
        }

        onSyncSuccess?.();
      },
      onExit: () => setToken(null),
    }),
    [isUpdateMode, token]
  );

  const { open, ready } = usePlaidLink(config);

  useEffect(() => {
    if (openRequested.current && token && ready) {
      openRequested.current = false;
      open();
    }
  }, [token, ready, open]);

  const preparing = loading || (Boolean(token) && !ready);

  return {
    onClick: () => {
      if (preparing) return;
      if (token && ready) {
        open();
        return;
      }
      openRequested.current = true;
      requestToken();
    },
    disabled: preparing,
    label: preparing
      ? "Loading..."
      : failed
        ? "Try again"
        : isUpdateMode
          ? "Reconnect account"
          : "Connect Bank Account",
  };
}
