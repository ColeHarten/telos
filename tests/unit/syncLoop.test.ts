import { describe, expect, it, vi } from "vitest";
import {
  importStatusOf,
  MAX_PAGINATION_RESTARTS,
  runSyncLoop,
  type CursorState,
  type LoopDeps,
  type SyncPage,
} from "@/lib/services/syncLoop";

const MUTATION = new Error("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION");

function page(nextCursor: string, hasMore: boolean): SyncPage {
  return { added: [], modified: [], removed: [], nextCursor, hasMore, updateStatus: "HISTORICAL_UPDATE_COMPLETE" };
}

/** Plaid's answers by cursor; a list answers in order, repeating its last entry. Each fetch takes `step` ms. */
function harness(answers: Record<string, SyncPage | Error | (SyncPage | Error)[]>, step = 0) {
  let clock = 0;
  const calls: Record<string, number> = {};
  const applied: CursorState[] = [];
  const completeLoop = vi.fn(async () => undefined);
  const onRestart = vi.fn();
  const deps: LoopDeps = {
    fetchPage: async (cursor) => {
      const entry = answers[cursor];
      const n = calls[cursor] ?? 0;
      calls[cursor] = n + 1;
      const answer = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
      if (!answer) throw new Error(`unexpected cursor "${cursor}"`);
      clock += step;
      if (answer instanceof Error) throw answer;
      return answer;
    },
    applyPage: async (_page, next) => {
      applied.push(next);
    },
    completeLoop,
    isMutationError: (err) => err === MUTATION,
    now: () => clock,
    onRestart,
  };
  return { deps, calls, applied, completeLoop, onRestart };
}

describe("runSyncLoop", () => {
  it("pages until Plaid has no more, saving the cursor after each page, then finishes the loop once", async () => {
    const h = harness({ "": page("c1", true), c1: page("c2", true), c2: page("c3", false) });
    const result = await runSyncLoop({ cursor: "", loopStartCursor: "" }, Infinity, h.deps);

    expect(result).toMatchObject({ more: false, pages: 3, state: { cursor: "c3", loopStartCursor: "c3" } });
    expect(h.applied).toEqual([
      { cursor: "c1", loopStartCursor: "" },
      { cursor: "c2", loopStartCursor: "" },
      { cursor: "c3", loopStartCursor: "c3" },
    ]);
    expect(h.completeLoop).toHaveBeenCalledTimes(1);
    expect(h.completeLoop).toHaveBeenCalledWith({ cursor: "c3", loopStartCursor: "c3" }, "HISTORICAL_UPDATE_COMPLETE");
  });

  it("stops once the time budget runs out and resumes from the saved cursor", async () => {
    const h = harness({ "": page("c1", true), c1: page("c2", true), c2: page("c3", false) }, 30);
    const first = await runSyncLoop({ cursor: "", loopStartCursor: "" }, 50, h.deps);
    expect(first).toMatchObject({ more: true, pages: 2, state: { cursor: "c2", loopStartCursor: "" } });
    expect(h.completeLoop).not.toHaveBeenCalled();

    const second = await runSyncLoop(first.state, Infinity, h.deps);
    expect(second).toMatchObject({ more: false, state: { cursor: "c3", loopStartCursor: "c3" } });
    expect(h.calls[""]).toBe(1);
    expect(h.completeLoop).toHaveBeenCalledTimes(1);
  });

  it("restarts at the start of the loop when data changes mid-loop", async () => {
    const h = harness({ "": page("c1", true), c1: [MUTATION, page("c2", false)] });
    const result = await runSyncLoop({ cursor: "", loopStartCursor: "" }, Infinity, h.deps);
    expect(result.state.cursor).toBe("c2");
    expect(h.calls[""]).toBe(2);
    expect(h.onRestart).toHaveBeenCalledTimes(1);
  });

  it("restarts a resumed loop where that loop began, not at the beginning of history", async () => {
    const h = harness({ c0: page("c1", true), c1: [MUTATION, page("c2", false)] });
    const result = await runSyncLoop({ cursor: "c1", loopStartCursor: "c0" }, Infinity, h.deps);
    expect(result.state.cursor).toBe("c2");
    expect(h.calls.c0).toBe(1);
    expect(h.calls[""]).toBeUndefined();
  });

  it("gives up after repeated restarts", async () => {
    const h = harness({ "": MUTATION });
    await expect(runSyncLoop({ cursor: "", loopStartCursor: "" }, Infinity, h.deps)).rejects.toBe(MUTATION);
    expect(h.calls[""]).toBe(MAX_PAGINATION_RESTARTS + 1);
    expect(h.applied).toEqual([]);
  });

  it("fails at once on any other error, without moving the cursor", async () => {
    const boom = new Error("boom");
    const h = harness({ "": boom });
    await expect(runSyncLoop({ cursor: "", loopStartCursor: "" }, Infinity, h.deps)).rejects.toBe(boom);
    expect(h.calls[""]).toBe(1);
    expect(h.applied).toEqual([]);
  });
});

describe("importStatusOf", () => {
  it("maps Plaid's transactions_update_status", () => {
    expect(importStatusOf("NOT_READY")).toBe("not_ready");
    expect(importStatusOf("INITIAL_UPDATE_COMPLETE")).toBe("initial");
    expect(importStatusOf("HISTORICAL_UPDATE_COMPLETE")).toBe("historical");
    expect(importStatusOf("TRANSACTIONS_UPDATE_STATUS_UNKNOWN")).toBe("unknown");
    expect(importStatusOf(null)).toBe("unknown");
  });
});
