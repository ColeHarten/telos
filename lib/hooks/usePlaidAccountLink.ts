"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { usePlaidLink } from "react-plaid-link";
import { useEffect, useMemo, useRef, useState } from "react";

export type PlaidAccountLinkTrigger = {
  onClick: () => void;
  disabled: boolean;
  label: string;
};

type PlaidAccountLinkOptions = {
  updateModeItemId?: string;
  onSyncSuccess?: () => void;
  onAccountsLinked?: (
    accounts: { id: string; name: string; accountType: string }[],
    skippedDuplicateCount: number
  ) => void;
  onLinkError?: (message: string) => void;
};

export default function usePlaidAccountLink({
  updateModeItemId,
  onSyncSuccess,
  onAccountsLinked,
  onLinkError,
}: PlaidAccountLinkOptions): PlaidAccountLinkTrigger {
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
      .then(async (res) => {
        // A non-2xx response still has a parseable JSON body (the routes
        // return `{ error: ... }`), so this has to be checked explicitly —
        // otherwise a failed request looks identical to "no token yet".
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed with status ${res.status}`);
        }

        const data = await res.json();
        if (!data.linkToken) {
          throw new Error("No link token returned.");
        }

        setToken(data.linkToken);
      })
      .catch((error) => {
        console.error(error);
        onLinkError?.("Could not prepare the bank connection.");
      })
      .finally(() => {
        // Always reset, success or failure, so a transient error can be
        // retried (e.g. the user re-opens the menu / clicks the button
        // again) instead of leaving the trigger permanently disabled.
        isFetching.current = false;
      });
  }, [isUpdateMode, onLinkError, token, updateModeItemId]);

  const config = useMemo(
    () => ({
      token: token ?? "",
      onSuccess: async (publicToken: string) => {
        if (!isUpdateMode) {
          try {
            const res = await authenticatedFetch("/api/plaid/exchange-token", {
              method: "POST",
              body: JSON.stringify({ public_token: publicToken }),
            });

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              onLinkError?.(errBody.message ?? "Could not link this account.");
              return;
            }

            const data = await res.json();
            onAccountsLinked?.(data.accounts ?? [], data.skippedDuplicateCount ?? 0);
          } catch (error) {
            console.error(error);
            onLinkError?.("Could not link this account.");
            return;
          }
        }

        onSyncSuccess?.();
      },
    }),
    [isUpdateMode, onAccountsLinked, onLinkError, onSyncSuccess, token]
  );

  const { open, ready } = usePlaidLink(config);

  return {
    onClick: () => open(),
    disabled: !token || !ready,
    label: ready ? (isUpdateMode ? "Reconnect account" : "Connect Bank Account") : "Loading...",
  };
}