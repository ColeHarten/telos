"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import type { Cashflow, CashflowKind, WithholdingProfile } from "../types/types";

export function useCashflows(user: any, authLoading: boolean) {
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [withholdingProfiles, setWithholdingProfiles] = useState<WithholdingProfile[]>([]);
  const [cashflowsLoading, setCashflowsLoading] = useState(false);
  const [withholdingProfilesLoading, setWithholdingProfilesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setCashflows([]);
      setWithholdingProfiles([]);
      setCashflowsLoading(false);
      setWithholdingProfilesLoading(false);
      return;
    }

    setCashflowsLoading(true);
    setWithholdingProfilesLoading(true);

    const cashflowsQuery = collection(db, "users", user.uid, "cashflows");
    const profilesQuery = collection(db, "users", user.uid, "withholdingProfiles");

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

    const unsubscribeProfiles = onSnapshot(
      profilesQuery,
      (snapshot) => {
        const next = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            payFrequency: data.payFrequency ?? "biweekly",
            grossSalary: Number(data.grossSalary ?? 0),
            linkedIncomeCashflowId: data.linkedIncomeCashflowId ?? "",
            deductions: data.deductions ?? [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as WithholdingProfile;
        });

        setWithholdingProfiles(next);
        setWithholdingProfilesLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load withholding profiles.");
        setWithholdingProfilesLoading(false);
      }
    );

    return () => {
      unsubscribeCashflows();
      unsubscribeProfiles();
    };
  }, [authLoading, user]);

  async function addCashflow(payload: { name: string; kind: CashflowKind; estimatedMonthly: number }) {
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

  async function updateCashflow(id: string, changes: Partial<Cashflow>) {
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

  async function addWithholdingProfile(payload: Omit<WithholdingProfile, "id">) {
    if (!user) throw new Error("Not signed in");
    const ref = doc(collection(db, "users", user.uid, "withholdingProfiles"));
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function updateWithholdingProfile(id: string, changes: Partial<WithholdingProfile>) {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "withholdingProfiles", id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  const getProfileById = (id: string) => withholdingProfiles.find((p) => p.id === id) || null;

  return {
    cashflows,
    withholdingProfiles,
    cashflowsLoading,
    withholdingProfilesLoading,
    error,
    addCashflow,
    updateCashflow,
    archiveCashflow,
    addWithholdingProfile,
    updateWithholdingProfile,
    getProfileById,
  };
}

export default useCashflows;