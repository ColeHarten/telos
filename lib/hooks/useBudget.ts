"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { AuthUser, BudgetLines, AppSettings, WithholdingProfile } from "../types/types";

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export function useBudget(user: AuthUser | null, authLoading: boolean, initialMonthKey?: string) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(
    initialMonthKey ?? getCurrentMonthKey()
  );

  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});
  const [budgetLines, setBudgetLines] = useState<BudgetLines>({});
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rangeBudgets, setRangeBudgets] = useState<Record<string, BudgetLines>>({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setBudgetValues({});
      setBudgetLines({});
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

  useEffect(() => {
    if (authLoading || !user) return;

    setBudgetValues((currentValues) => {
      let nextValues = currentValues;

      return nextValues;
    });
  }, [authLoading, user]);

  async function saveBudget(monthKey: string, lines: BudgetLines) {
    if (!user) throw new Error("Not signed in");
    setIsSaving(true);
    try {
      await setDoc(doc(db, "users", user.uid, "budgets", monthKey), {
        monthKey,
        currency: "USD",
        lines,
        updatedAt: serverTimestamp(),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSettings(next: Partial<AppSettings>) {
    if (!user) throw new Error("Not signed in");
    await setDoc(
      doc(db, "users", user.uid, "settings", "app"),
      {
        ...next,
        updatedAt: serverTimestamp(),
      },
      { merge: true } as any
    );
  }

  async function ensureUserProfile() {
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
  }

  async function copyPreviousMonth(monthKey: string) {
    if (!user) throw new Error("Not signed in");

    const [year, month] = monthKey.split("-").map(Number);
    const previousMonthDate = new Date(year, month - 2, 1);
    const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(
      previousMonthDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const previousBudgetSnapshot = await getDoc(
      doc(db, "users", user.uid, "budgets", previousMonthKey)
    );

    if (!previousBudgetSnapshot.exists()) {
      // No previous budget to copy from, so just clear the current budget values and lines
      setBudgetValues({});
      setBudgetLines({});
      return;
    }

    const previousBudget = previousBudgetSnapshot.data();
    const previousLines = (previousBudget.lines ?? {}) as BudgetLines;

    const copiedValues: Record<string, string> = {};
    for (const [lineId, line] of Object.entries(previousLines)) {
      copiedValues[lineId] = String(line.planned ?? 0);
    }

    setBudgetValues(copiedValues);
    setBudgetLines(previousLines);
  }

  function setBudgetValue(lineId: string, nextValue: string) {
    setBudgetValues((cur) => ({ ...cur, [lineId]: nextValue }));
  }

  async function loadBudgetRange(startMonthKey: string, endMonthKey: string) {
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
  }

  function clearBudgetRange() {
    setRangeBudgets({});
    setRangeError(null);
  }

  return {
    selectedMonthKey,
    setSelectedMonthKey,
    budgetValues,
    budgetLines,
    setBudgetValue,
    isSaving,
    budgetLoading,
    error,
    saveBudget,
    settings,
    updateSettings,
    ensureUserProfile,
    copyPreviousMonth,
    rangeBudgets,
    rangeLoading,
    rangeError,
    loadBudgetRange,
    clearBudgetRange,
  };
}

export default useBudget;
