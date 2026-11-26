"use client";

import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { clearLinkSession, saveLinkSession } from "@/lib/plaidLinkState";
import { runSync, type SyncSummary } from "@/lib/plaidSync";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { useEffect, useMemo, useRef, useState } from "react";

const TOKEN_MAX_AGE_MS = 30 * 60 * 1000;

export type LinkedAccount = { id: string; name: string; accountType: string };

export type PlaidAccountLinkTrigger = {
  onClick: () => void;
  disabled: boolean;
  label: string;
  /** Fetches a link token ahead of the click, so Link opens right away. */
  prepare: () => void;
};

export type PlaidAccountLink = PlaidAccountLinkTrigger & {
  /** Set when the bank is already connected and the server asks whether this is a different login. */
  confirmation: { message: string } | null;
  confirmDifferentLogin: () => void;
  cancelConfirmation: () => void;
  /** Saving a new connection, or syncing after update mode. */
  finishing: boolean;
};

export type PlaidAccountLinkOptions = {
  /** Update mode for this connection: Reconnect, or Manage accounts with accountSelection. */
  updateModeItemId?: string;
  accountSelection?: boolean;
  /** Reopens Link after an OAuth bank sends the user back to /oauth. */
  resume?: { token: string; receivedRedirectUri: string };
  onAccountsLinked?: (accounts: LinkedAccount[], skippedDuplicateCount: number, reattachedCount: number) => void;
  /** Update mode finished and the connection has synced. */
  onUpdateComplete?: (summary: SyncSummary) => void;
  onLinkError?: (message: string) => void;
  /** Link closed without finishing. */
  onExit?: () => void;
  /** Runs right before Link opens. Close any dialog here: its focus trap blocks Link. */
  onOpen?: () => void;
};

type PendingExchange = { publicToken: string; metadata: PlaidLinkOnSuccessMetadata };

type ExchangeOutcome =
  | { kind: "linked"; accounts: LinkedAccount[]; skippedDuplicateCount: number; reattachedCount: number }
  | { kind: "confirm"; message: string }
  | { kind: "error"; message: string };

// API routes return { error, message } on failure; message is safe to show.
function messageFrom(body: Record<string, unknown> | null, fallback: string): string {
  return typeof body?.message === "string" && body.message ? body.message : fallback;
}

async function fetchLinkToken(updateModeItemId: string | undefined, accountSelection: boolean): Promise<string> {
  const res = updateModeItemId
    ? await authenticatedFetch("/api/plaid/create-update-link-token", {
        method: "POST",
        body: JSON.stringify({ itemId: updateModeItemId, accountSelection }),
      })
    : await authenticatedFetch("/api/plaid/create-link-token", { method: "POST" });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error(messageFrom(body, "Could not prepare the bank connection."));
  if (typeof body?.linkToken !== "string" || !body.linkToken) throw new Error("Could not prepare the bank connection.");
  return body.linkToken;
}

function linkedAccounts(value: unknown): LinkedAccount[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const account = entry as Partial<LinkedAccount> | null;
    return account && typeof account.id === "string" && typeof account.name === "string"
      ? [{ id: account.id, name: account.name, accountType: typeof account.accountType === "string" ? account.accountType : "" }]
      : [];
  });
}

/**
 * Sends the public token with Link's description of the bank and accounts.
 * The server checks for duplicates before it exchanges the token, so a
 * refused link never uses up a Plaid connection.
 */
async function postExchange(request: PendingExchange, confirmDifferentLogin: boolean): Promise<ExchangeOutcome> {
  const { publicToken, metadata } = request;
  const res = await authenticatedFetch("/api/plaid/exchange-token", {
    method: "POST",
    body: JSON.stringify({
      public_token: publicToken,
      institution: metadata.institution
        ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
        : null,
      accounts: (metadata.accounts ?? []).map((account) => ({
        id: account.id,
        name: account.name,
        mask: account.mask,
        type: account.type,
        subtype: account.subtype,
      })),
      confirmDifferentLogin,
    }),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) {
    return {
      kind: "linked",
      accounts: linkedAccounts(body?.accounts),
      skippedDuplicateCount: Number(body?.skippedDuplicateCount) || 0,
      reattachedCount: Number(body?.reattachedCount) || 0,
    };
  }
  const message = messageFrom(body, "Could not link this account.");
  if (res.status === 409 && body?.error === "same_institution") return { kind: "confirm", message };
  return { kind: "error", message };
}

/**
 * Opens Plaid Link for a new bank, or in update mode for an existing one. The
 * link token is requested on click and dropped when Link closes, so every
 * session starts fresh. It's also kept for the OAuth redirect (see /oauth).
 */
export default function usePlaidAccountLink(options: PlaidAccountLinkOptions = {}): PlaidAccountLink {
  const { updateModeItemId, accountSelection = false, resume } = options;
  const isUpdateMode = Boolean(updateModeItemId);

  const [token, setToken] = useState<string | null>(resume?.token ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmation, setConfirmation] = useState<{ message: string } | null>(null);

  // Set by a click (or a resumed OAuth session); Link opens once its token is ready.
  const openRequested = useRef(Boolean(resume));
  // When the current token was fetched (0 for a resumed one), so an old prepared token is replaced.
  const tokenFetchedAt = useRef(0);
  // A new link waiting for "This is a different login".
  const pending = useRef<PendingExchange | null>(null);

  // The latest callbacks, read when they fire, so inline callbacks from the
  // caller don't rebuild the Link config every render.
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  const resumeToken = resume?.token ?? null;
  const receivedRedirectUri = resume && token === resumeToken ? resume.receivedRedirectUri : undefined;

  const config = useMemo(() => {
    async function finishNewLink(request: PendingExchange, confirmDifferentLogin: boolean) {
      setFinishing(true);
      try {
        const outcome = await postExchange(request, confirmDifferentLogin);
        if (outcome.kind === "confirm") {
          pending.current = request;
          setConfirmation({ message: outcome.message });
          return;
        }
        pending.current = null;
        if (outcome.kind === "error") {
          callbacks.current.onLinkError?.(outcome.message);
          return;
        }
        callbacks.current.onAccountsLinked?.(outcome.accounts, outcome.skippedDuplicateCount, outcome.reattachedCount);
      } catch (error) {
        console.error(error);
        pending.current = null;
        callbacks.current.onLinkError?.("Could not link this bank.");
      } finally {
        setFinishing(false);
      }
    }

    return {
      token: token ?? "",
      receivedRedirectUri,
      onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
        setToken(null);
        clearLinkSession();

        if (updateModeItemId) {
          // Update mode keeps the same access token: nothing to exchange.
          // Sync now so newly shared accounts and a cleared login error show up.
          setFinishing(true);
          runSync(updateModeItemId, { afterCurrent: true })
            .then((summary) => callbacks.current.onUpdateComplete?.(summary))
            .catch((error: unknown) => {
              console.error(error);
              callbacks.current.onLinkError?.("The bank is updated, but the sync after it failed. Try Refresh.");
            })
            .finally(() => setFinishing(false));
          return;
        }

        void finishNewLink({ publicToken, metadata }, false);
      },
      onExit: () => {
        setToken(null);
        clearLinkSession();
        callbacks.current.onExit?.();
      },
      finishNewLink,
    };
  }, [token, receivedRedirectUri, updateModeItemId]);

  const { open, ready } = usePlaidLink({
    token: config.token,
    receivedRedirectUri: config.receivedRedirectUri,
    onSuccess: config.onSuccess,
    onExit: config.onExit,
  });

  useEffect(() => {
    if (openRequested.current && token && ready) {
      openRequested.current = false;
      callbacks.current.onOpen?.();
      open();
    }
  }, [token, ready, open]);

  // quiet: prepared ahead of a click, so a failure only shows as "Try again".
  function requestToken(quiet: boolean) {
    setLoading(true);
    setFailed(false);
    fetchLinkToken(updateModeItemId, accountSelection)
      .then((linkToken) => {
        saveLinkSession({ token: linkToken, updateModeItemId: updateModeItemId ?? null, accountSelection });
        tokenFetchedAt.current = Date.now();
        setToken(linkToken);
      })
      .catch((error: unknown) => {
        console.error(error);
        openRequested.current = false;
        setFailed(true);
        if (!quiet) {
          callbacks.current.onLinkError?.(error instanceof Error ? error.message : "Could not prepare the bank connection.");
        }
      })
      .finally(() => setLoading(false));
  }

  // Link tokens last four hours; a prepared one older than this is replaced.
  function tokenIsFresh(): boolean {
    return tokenFetchedAt.current === 0 || Date.now() - tokenFetchedAt.current < TOKEN_MAX_AGE_MS;
  }

  const preparing = loading || (Boolean(token) && !ready);
  const busy = preparing || finishing;

  return {
    onClick: () => {
      if (busy) return;
      if (token && ready && tokenIsFresh()) {
        callbacks.current.onOpen?.();
        open();
        return;
      }
      openRequested.current = true;
      requestToken(false);
    },
    prepare: () => {
      if (loading || finishing || (token && tokenIsFresh())) return;
      requestToken(true);
    },
    disabled: busy,
    label: finishing
      ? "Finishing..."
      : preparing
        ? "Loading..."
        : failed
          ? "Try again"
          : isUpdateMode
            ? accountSelection
              ? "Manage accounts"
              : "Reconnect account"
            : "Connect Bank Account",
    confirmation,
    confirmDifferentLogin: () => {
      const request = pending.current;
      setConfirmation(null);
      if (request) void config.finishNewLink(request, true);
    },
    cancelConfirmation: () => {
      pending.current = null;
      setConfirmation(null);
    },
    finishing,
  };
}
