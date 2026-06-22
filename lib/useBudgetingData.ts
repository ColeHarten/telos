"use client";

import { auth, db } from "@/lib/firebaseClient";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import type {
    Account,
    AccountType,
    AppSettings,
    BudgetLines,
    Cashflow,
    CashflowKind,
    Currency,
    DefaultBudgetMonth,
} from "./types";

type AccountUpdate = Partial<
  Pick<
    Account,
    | "name"
    | "accountType"
    | "normalBalance"
    | "startingBalance"
    | "currentBalance"
    | "isArchived"
  >
>;

type CashflowUpdate = Partial<
  Pick<
    Cashflow,
    | "name"
    | "kind"
    | "estimatedMonthly"
    | "sortOrder"
    | "isDefault"
    | "isArchived"
  >
>;

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export function useBudgetingData(initialMonthKey?: string) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cashflowsLoading, setCashflowsLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(
    initialMonthKey ?? getCurrentMonthKey()
  );

  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});
  const [budgetLines, setBudgetLines] = useState<BudgetLines>({});
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Range state: a one-shot fetch of multiple budget docs for an arbitrary
  // [startMonthKey, endMonthKey] window, used by multi-month dashboard views.
  // This is intentionally separate from the live single-month subscription
  // above (budgetLines/budgetValues), since a 12-listener subscription for a
  // read-mostly trend view isn't worth the realtime overhead.
  const [rangeBudgets, setRangeBudgets] = useState<
    Record<string, BudgetLines>
  >({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const isLoading = authLoading || cashflowsLoading || accountsLoading || budgetLoading;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser) {
        setCashflows([]);
        setAccounts([]);
        setBudgetValues({});
        setBudgetLines({});
        setSettings(null);
        setCashflowsLoading(false);
        setAccountsLoading(false);
        setBudgetLoading(false);
        setRangeBudgets({});
      }

      setUser(nextUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setCashflows([]);
      setAccounts([]);
      setCashflowsLoading(false);
      setAccountsLoading(false);
      return;
    }

    setCashflowsLoading(true);
    setAccountsLoading(true);

    const cashflowsQuery = query(
      collection(db, "users", user.uid, "cashflows"),
      orderBy("sortOrder", "asc")
    );

    const accountsQuery = query(
      collection(db, "users", user.uid, "accounts"),
      orderBy("createdAt", "asc")
    );

    const unsubscribeCashflows = onSnapshot(
      cashflowsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            kind: data.kind ?? ("expense" as CashflowKind),
            estimatedMonthly: Number(data.estimatedMonthly ?? 0),
            sortOrder: Number(data.sortOrder ?? 0),
            isDefault: Boolean(data.isDefault ?? false),
            isArchived: Boolean(data.isArchived ?? false),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Cashflow;
        });

        setCashflows(next);
        setCashflowsLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load cashflows.");
        setCashflowsLoading(false);
      }
    );

    const unsubscribeAccounts = onSnapshot(
      accountsQuery,
      (snapshot) => {
        const next = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            accountType: (data.accountType ?? ("cash" as AccountType)) as AccountType,
            normalBalance: (data.normalBalance ?? "asset") as any,
            startingBalance: data.startingBalance === undefined ? undefined : Number(data.startingBalance),
            currentBalance: data.currentBalance === undefined ? undefined : Number(data.currentBalance),
            isManual: Boolean(data.isManual ?? true),
            isArchived: Boolean(data.isArchived ?? false),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Account;
        });

        setAccounts(next);
        setAccountsLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load accounts.");
        setAccountsLoading(false);
      }
    );

    return () => {
      unsubscribeCashflows();
      unsubscribeAccounts();
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    setBudgetValues((currentValues) => {
      let nextValues = currentValues;

      for (const cashflow of cashflows) {
        if (cashflow.isArchived) {
          continue;
        }

        const lineId = `cashflow_${cashflow.id}`;

        if (nextValues[lineId] !== undefined) {
          continue;
        }

        if (nextValues === currentValues) {
          nextValues = { ...currentValues };
        }

        nextValues[lineId] = String(cashflow.estimatedMonthly ?? 0);
      }

      return nextValues;
    });
  }, [authLoading, user, cashflows]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

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
    if (authLoading) {
      return;
    }

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
          currency: (data.currency ?? "USD") as Currency,
          defaultBudgetMonth: (data.defaultBudgetMonth ?? "current") as DefaultBudgetMonth,
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

  async function addCashflow(payload: {
    name: string;
    kind: CashflowKind;
    estimatedMonthly: number;
  }) {
    if (!user) throw new Error("Not signed in");

    const ref = doc(collection(db, "users", user.uid, "cashflows"));

    await setDoc(ref, {
      name: payload.name,
      kind: payload.kind,
      estimatedMonthly: payload.estimatedMonthly,
      sortOrder: Date.now(),
      isDefault: false,
      isArchived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function updateCashflow(id: string, changes: CashflowUpdate) {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "cashflows", id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  async function archiveCashflow(id: string) {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "cashflows", id), {
      isArchived: true,
      updatedAt: serverTimestamp(),
    });
  }

  async function addAccount(payload: {
    name: string;
    accountType: AccountType;
    normalBalance: string;
    startingBalance?: number;
  }) {
    if (!user) throw new Error("Not signed in");

    const ref = doc(collection(db, "users", user.uid, "accounts"));

    await setDoc(ref, {
      name: payload.name,
      accountType: payload.accountType,
      normalBalance: payload.normalBalance,
      startingBalance: payload.startingBalance ?? 0,
      currentBalance: payload.startingBalance ?? 0,
      isManual: true,
      isArchived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function updateAccount(id: string, changes: AccountUpdate) {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "accounts", id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  async function archiveAccount(id: string) {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "accounts", id), {
      isArchived: true,
      updatedAt: serverTimestamp(),
    });
  }

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
      throw new Error("No previous budget");
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

  // One-shot fetch of every budget doc whose monthKey falls within
  // [startMonthKey, endMonthKey], inclusive. Relies on "YYYY-MM" sorting
  // lexicographically the same as chronologically, so a documentId() range
  // query works without needing one read per month.
  // Months with no saved budget simply won't have an entry in the result;
  // callers should treat missing months as zero/empty, not as an error.
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
    user,
    cashflows,
    accounts,
    selectedMonthKey,
    setSelectedMonthKey,
    budgetValues,
    budgetLines,
    setBudgetValue,
    authLoading,
    isLoading,
    isSaving,
    error,
    addCashflow,
    updateCashflow,
    archiveCashflow,
    addAccount,
    updateAccount,
    archiveAccount,
    saveBudget,
    settings,
    updateSettings,
    ensureUserProfile,
    copyPreviousMonth,
    // Multi-month range support (one-shot fetch, not a live subscription)
    rangeBudgets,
    rangeLoading,
    rangeError,
    loadBudgetRange,
    clearBudgetRange,
  };
}

export default useBudgetingData;