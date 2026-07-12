"use client";

import { db } from "@/lib/firebaseClient";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, AuthUser, BudgetLines } from "../types/types";

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function parseAmount(value: string) {
  const n = Number(value || 0);
  return Number.isNaN(n) ? 0 : n;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useBudget(user: AuthUser | null, authLoading: boolean, initialMonthKey?: string) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(
    initialMonthKey ?? getCurrentMonthKey()
  );

  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});
  const [budgetLines, setBudgetLines] = useState<BudgetLines>({});
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [rangeBudgets, setRangeBudgets] = useState<Record<string, BudgetLines>>({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Refs mirror the latest values so the debounce/flush logic never saves stale data.
  const budgetLinesRef = useRef<BudgetLines>({});
  const monthKeyRef = useRef(selectedMonthKey);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    monthKeyRef.current = selectedMonthKey;
  }, [selectedMonthKey]);

  // Load the single selected month's budget doc, live.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setBudgetValues({});
      setBudgetLines({});
      budgetLinesRef.current = {};
      setBudgetLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid, "budgets", selectedMonthKey);
    setBudgetLoading(true);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists()) {
          setBudgetValues({});
          setBudgetLines({});
          budgetLinesRef.current = {};
          setBudgetLoading(false);
          return;
        }

        const data = snapshot.data();
        const lines = (data.lines ?? {}) as BudgetLines;

        const next: Record<string, string> = {};
        for (const [id, line] of Object.entries(lines)) {
          next[id] = String((line as any).planned ?? 0);
        }

        setBudgetValues(next);
        setBudgetLines(lines);
        budgetLinesRef.current = lines;
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

  // Load (and lazily create) the user's app settings doc, live.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSettings(null);
      return;
    }

    const settingsRef = doc(db, "users", user.uid, "settings", "app");

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          (async () => {
            const defaultSettings: AppSettings = {
              currency: "USD",
              defaultBudgetMonth: "current",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };

            try {
              await setDoc(settingsRef, defaultSettings);
              setSettings(defaultSettings);
            } catch (err) {
              console.error(err);
            }
          })();
          return;
        }

        const data = snapshot.data();
        setSettings({
          currency: (data.currency ?? "USD") as any,
          defaultBudgetMonth: (data.defaultBudgetMonth ?? "current") as any,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      },
      (err) => {
        console.error(err);
      }
    );

    return () => unsubscribe();
  }, [authLoading, user]);

  const saveBudget = useCallback(
    async (monthKey: string, lines: BudgetLines) => {
      if (!user) throw new Error("Not signed in");
      await setDoc(doc(db, "users", user.uid, "budgets", monthKey), {
        monthKey,
        currency: "USD",
        lines,
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  // Writes whatever is currently in budgetLinesRef, immediately, and cancels any pending debounce.
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!user) return;

    setSaveStatus("saving");
    try {
      await saveBudget(monthKeyRef.current, budgetLinesRef.current);
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    }
  }, [user, saveBudget]);

  // Debounces writes while the user is actively editing.
  const scheduleSave = useCallback(() => {
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [flushSave]);

  // Flush any pending save before switching months, on unmount, or on tab close.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) flushSave();
    };
  }, [selectedMonthKey, flushSave]);

  useEffect(() => {
    setSaveStatus("idle");
  }, [selectedMonthKey]);

  useEffect(() => {
    function handleBeforeUnload() {
      if (saveTimerRef.current) flushSave();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushSave]);

  const ensureUserProfile = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    await setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [user]);

  const updateSettings = useCallback(
    async (next: Partial<AppSettings>) => {
      if (!user) throw new Error("Not signed in");
      await setDoc(
        doc(db, "users", user.uid, "settings", "app"),
        { ...next, updatedAt: serverTimestamp() },
        { merge: true } as any
      );
    },
    [user]
  );

  // The only way budget values change: updates local state immediately (optimistic),
  // and schedules a debounced whole-document write.
  const setBudgetValue = useCallback(
    (lineId: string, nextValue: string, lineType: BudgetLines[string]["lineType"], categoryId: string) => {
      setBudgetValues((cur) => ({ ...cur, [lineId]: nextValue }));

      setBudgetLines((cur) => {
        const next = {
          ...cur,
          [lineId]: { id: lineId, lineType, categoryId, planned: parseAmount(nextValue) },
        };
        budgetLinesRef.current = next;
        return next;
      });

      scheduleSave();
    },
    [scheduleSave]
  );

  const loadBudgetRange = useCallback(
    async (startMonthKey: string, endMonthKey: string) => {
      if (!user) throw new Error("Not signed in");

      setRangeLoading(true);
      setRangeError(null);

      try {
        const budgetsRef = collection(db, "users", user.uid, "budgets");
        const rangeQuery = query(
          budgetsRef,
          where(documentId(), ">=", startMonthKey),
          where(documentId(), "<=", endMonthKey)
        );

        const snapshot = await getDocs(rangeQuery);

        const next: Record<string, BudgetLines> = {};
        for (const docSnapshot of snapshot.docs) {
          const data = docSnapshot.data();
          next[docSnapshot.id] = (data.lines ?? {}) as BudgetLines;
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
    settings,
    updateSettings,
    ensureUserProfile,
    rangeBudgets,
    rangeLoading,
    rangeError,
    loadBudgetRange,
    clearBudgetRange,
  };
}

export default useBudget;