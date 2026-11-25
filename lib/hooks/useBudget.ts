"use client";

import { getCurrentMonthKey } from "@/lib/budgetCalculations";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthUser, BudgetLine, BudgetLines } from "../types/types";

function parseAmount(value: string) {
  const n = Number(value || 0);
  return Number.isNaN(n) ? 0 : n;
}

function toValues(lines: BudgetLines): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [id, line] of Object.entries(lines)) values[id] = String(line.planned ?? 0);
  return values;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Lines edited locally but not yet confirmed saved, by month.
type PendingLines = Record<string, BudgetLines>;

export function useBudget(user: AuthUser | null, authLoading: boolean, initialMonthKey?: string) {
  const [selectedMonthKey, setMonthKeyState] = useState<string>(initialMonthKey ?? getCurrentMonthKey());

  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});
  const [budgetLines, setBudgetLines] = useState<BudgetLines>({});
  const [budgetLoading, setBudgetLoading] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [rangeBudgets, setRangeBudgets] = useState<Record<string, BudgetLines>>({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Edits waiting for the debounce, and edits being written. A snapshot from
  // another tab never replaces either, so unsaved local edits survive.
  const pendingRef = useRef<PendingLines>({});
  const inFlightRef = useRef<PendingLines>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSelectedMonthKey = useCallback((monthKey: string) => {
    setMonthKeyState(monthKey);
    setSaveStatus("idle");
  }, []);

  // Live view of the selected month, with unsaved local edits laid on top.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setBudgetValues({});
      setBudgetLines({});
      setBudgetLoading(false);
      return;
    }

    const monthKey = selectedMonthKey;
    setBudgetLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid, "budgets", monthKey),
      (snapshot) => {
        const server = (snapshot.exists() ? snapshot.data().lines ?? {} : {}) as BudgetLines;
        const lines: BudgetLines = {
          ...server,
          ...(inFlightRef.current[monthKey] ?? {}),
          ...(pendingRef.current[monthKey] ?? {}),
        };
        setBudgetLines(lines);
        setBudgetValues((current) => {
          const next = toValues(lines);
          // Keep the exact text being typed (e.g. "12.") for lines with unsaved edits.
          for (const id of Object.keys(pendingRef.current[monthKey] ?? {})) {
            if (id in current) next[id] = current[id];
          }
          return next;
        });
        setBudgetLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load budget.");
        setBudgetLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authLoading, user, selectedMonthKey]);

  // Writes every pending line as its own merged field, so other lines (and
  // edits from another tab) are never overwritten.
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!user) return;

    const batch = pendingRef.current;
    if (Object.keys(batch).length === 0) return;
    pendingRef.current = {};
    for (const [monthKey, lines] of Object.entries(batch)) {
      inFlightRef.current[monthKey] = { ...(inFlightRef.current[monthKey] ?? {}), ...lines };
    }

    setSaveStatus("saving");
    try {
      await Promise.all(
        Object.entries(batch).map(([monthKey, lines]) =>
          setDoc(
            doc(db, "users", user.uid, "budgets", monthKey),
            { monthKey, currency: "USD", lines, updatedAt: serverTimestamp() },
            { merge: true }
          )
        )
      );
      setSaveStatus(Object.keys(pendingRef.current).length > 0 ? "saving" : "saved");
    } catch (err) {
      console.error(err);
      // Put failed lines back unless they were edited again meanwhile.
      for (const [monthKey, lines] of Object.entries(batch)) {
        pendingRef.current[monthKey] = { ...lines, ...(pendingRef.current[monthKey] ?? {}) };
      }
      setSaveStatus("error");
    } finally {
      for (const [monthKey, lines] of Object.entries(batch)) {
        const inFlight = inFlightRef.current[monthKey] ?? {};
        for (const id of Object.keys(lines)) {
          if (inFlight[id] === lines[id]) delete inFlight[id];
        }
        if (Object.keys(inFlight).length === 0) delete inFlightRef.current[monthKey];
      }
    }
  }, [user]);

  const scheduleSave = useCallback(() => {
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [flushSave]);

  // Flush pending edits on month change, unmount, or tab close.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) void flushSave();
    };
  }, [selectedMonthKey, flushSave]);

  useEffect(() => {
    function handleBeforeUnload() {
      if (saveTimerRef.current) void flushSave();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushSave]);

  // Updates local state immediately and schedules a debounced save of this line.
  const setBudgetValue = useCallback(
    (lineId: string, nextValue: string, lineType: BudgetLine["lineType"], categoryId: string) => {
      const line: BudgetLine = { id: lineId, lineType, categoryId, planned: parseAmount(nextValue) };
      const monthKey = selectedMonthKey;
      pendingRef.current[monthKey] = { ...(pendingRef.current[monthKey] ?? {}), [lineId]: line };

      setBudgetValues((cur) => ({ ...cur, [lineId]: nextValue }));
      setBudgetLines((cur) => ({ ...cur, [lineId]: line }));
      scheduleSave();
    },
    [selectedMonthKey, scheduleSave]
  );

  const loadBudgetRange = useCallback(
    async (startMonthKey: string, endMonthKey: string) => {
      if (!user) throw new Error("Not signed in");

      setRangeLoading(true);
      setRangeError(null);

      try {
        const rangeQuery = query(
          collection(db, "users", user.uid, "budgets"),
          where(documentId(), ">=", startMonthKey),
          where(documentId(), "<=", endMonthKey)
        );
        const snapshot = await getDocs(rangeQuery);

        const next: Record<string, BudgetLines> = {};
        for (const docSnapshot of snapshot.docs) {
          next[docSnapshot.id] = (docSnapshot.data().lines ?? {}) as BudgetLines;
        }

        setRangeBudgets(next);
        return next;
      } catch (err) {
        console.error(err);
        setRangeError("Could not load budgets for the selected range.");
        throw err;
      } finally {
        setRangeLoading(false);
      }
    },
    [user]
  );

  const clearBudgetRange = useCallback(() => {
    setRangeBudgets({});
    setRangeError(null);
  }, []);

  return {
    selectedMonthKey,
    setSelectedMonthKey,
    budgetValues,
    budgetLines,
    setBudgetValue,
    saveStatus,
    flushSave,
    budgetLoading,
    error,
    rangeBudgets,
    rangeLoading,
    rangeError,
    loadBudgetRange,
    clearBudgetRange,
  };
}

export default useBudget;
