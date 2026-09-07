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
      .then((res) => res.json())
      .then((data) => {
        if (data.linkToken) setToken(data.linkToken);
      })
      .catch((error) => {
        console.error(error);
        onLinkError?.("Could not prepare the bank connection.");
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