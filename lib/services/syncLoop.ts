import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";

/**
 * The /transactions/sync pagination loop, with Plaid and Firestore passed in
 * so it can be unit tested. Each page is written and its cursor saved before
 * the next page is fetched, so a run that stops (the time budget, a crash)
 * resumes where it left off instead of starting over.
 */

export type ImportStatus = "not_ready" | "initial" | "historical" | "unknown";

/** Plaid's transactions_update_status, as stored on a connection's status doc. */
export function importStatusOf(status: string | null | undefined): ImportStatus {
  switch (status) {
    case "NOT_READY":
      return "not_ready";
    case "INITIAL_UPDATE_COMPLETE":
      return "initial";
    case "HISTORICAL_UPDATE_COMPLETE":
      return "historical";
    default:
      return "unknown";
  }
}

export type SyncPage = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
  hasMore: boolean;
  updateStatus: string | null;
};

/** Where a connection's sync stands. Both cursors are saved after every page. */
export type CursorState = {
  cursor: string;
  /** Where the current pagination loop began. Plaid requires restarting there if data changes mid-loop. */
  loopStartCursor: string;
};

export type LoopDeps = {
  fetchPage: (cursor: string) => Promise<SyncPage>;
  /** Writes the page's transactions, then saves `next`. */
  applyPage: (page: SyncPage, next: CursorState) => Promise<void>;
  /** Runs once a loop reaches the end of Plaid's changes. */
  completeLoop: (state: CursorState, updateStatus: string | null) => Promise<void>;
  isMutationError: (err: unknown) => boolean;
  now: () => number;
  onRestart?: (attempt: number) => void;
};

export type LoopResult = {
  state: CursorState;
  /** True when Plaid has more pages and the time budget ran out first. */
  more: boolean;
  pages: number;
  updateStatus: string | null;
};

export const MAX_PAGINATION_RESTARTS = 3;

/**
 * Pages through Plaid's changes from start.cursor until Plaid has no more, or
 * until `deadline` passes after a page. Writes are idempotent, so pages that
 * are fetched again after a restart do no harm.
 */
export async function runSyncLoop(start: CursorState, deadline: number, deps: LoopDeps): Promise<LoopResult> {
  let state: CursorState = { ...start };
  let restarts = 0;
  let pages = 0;
  let updateStatus: string | null = null;

  for (;;) {
    let page: SyncPage;
    try {
      page = await deps.fetchPage(state.cursor);
    } catch (err) {
      if (!deps.isMutationError(err) || restarts >= MAX_PAGINATION_RESTARTS) throw err;
      restarts += 1;
      deps.onRestart?.(restarts);
      state = { cursor: state.loopStartCursor, loopStartCursor: state.loopStartCursor };
      continue;
    }

    pages += 1;
    updateStatus = page.updateStatus;
    const next: CursorState = page.hasMore
      ? { cursor: page.nextCursor, loopStartCursor: state.loopStartCursor }
      : { cursor: page.nextCursor, loopStartCursor: page.nextCursor };
    await deps.applyPage(page, next);
    state = next;

    if (!page.hasMore) {
      await deps.completeLoop(state, updateStatus);
      return { state, more: false, pages, updateStatus };
    }
    if (deps.now() >= deadline) return { state, more: true, pages, updateStatus };
  }
}
