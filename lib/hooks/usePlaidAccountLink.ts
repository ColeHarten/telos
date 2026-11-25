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

export default function usePlaidAccountLink(options: PlaidAccountLinkOptions): PlaidAccountLinkTrigger {
  const { updateModeItemId } = options;
  const isUpdateMode = Boolean(updateModeItemId);

  const [token, setToken] = useState<string | null>(null);
  const [tokenFailed, setTokenFailed] = useState(false);
  const isFetching = useRef(false);

  // The latest callbacks, read when they fire. Callers often pass inline
  // functions, and depending on them would re-request link tokens every render.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  // A failed request is not retried automatically; the button offers "Try again".
  const requestToken = useCallback(() => {
    if (isFetching.current) return;
    isFetching.current = true;

    fetchLinkToken(updateModeItemId)
      .then((linkToken) => {
        setToken(linkToken);
        setTokenFailed(false);
      })
      .catch((error: unknown) => {
        console.error(error);
        setTokenFailed(true);
        callbacks.current.onLinkError?.("Could not prepare the bank connection.");
      })
      .finally(() => {
        isFetching.current = false;
      });
  }, [updateModeItemId]);

  useEffect(() => {
    requestToken();
  }, [requestToken]);

  const config = useMemo(
    () => ({
      token: token ?? "",
      onSuccess: async (publicToken: string) => {
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
      onExit: (error: { error_code?: string } | null) => {
        // Link tokens expire after a few hours. Fetch a fresh one for the next attempt.
        if (error?.error_code === "INVALID_LINK_TOKEN") requestToken();
      },
    }),
    [isUpdateMode, requestToken, token]
  );

  const { open, ready } = usePlaidLink(config);

  return {
    onClick: () => {
      if (tokenFailed) {
        setTokenFailed(false);
        requestToken();
      } else {
        open();
      }
    },
    disabled: tokenFailed ? false : !token || !ready,
    label: tokenFailed ? "Try again" : ready ? (isUpdateMode ? "Reconnect account" : "Connect Bank Account") : "Loading...",
  };
}
