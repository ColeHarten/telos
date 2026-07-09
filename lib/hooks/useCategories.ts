"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import type { AuthUser, Category, CategoryKind, PaycheckProfile } from "../types/types";

export function useCategories(user: AuthUser | null, authLoading: boolean) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [paycheckProfiles, setPaycheckProfiles] = useState<PaycheckProfile[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [paycheckProfilesLoading, setPaycheckProfilesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setCategories([]);
      setPaycheckProfiles([]);
      setCategoriesLoading(false);
      setPaycheckProfilesLoading(false);
      return;
    }

    setCategoriesLoading(true);
    setPaycheckProfilesLoading(true);

    const categoriesQuery = collection(db, "users", user.uid, "categories");
    const profilesQuery = collection(db, "users", user.uid, "paycheckProfiles");

    const unsubscribeCategories = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const next = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            kind: data.kind ?? ("expense" as CategoryKind),
            estimatedMonthly: Number(data.estimatedMonthly ?? 0),
            sortOrder: Number(data.sortOrder ?? 0),
            isDefault: Boolean(data.isDefault ?? false),
            isArchived: Boolean(data.isArchived ?? false),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Category;
        });

        setCategories(next);
        setCategoriesLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load categories.");
        setCategoriesLoading(false);
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
            linkedIncomeCategoryId: data.linkedIncomeCategoryId ?? "",
            deductions: data.deductions ?? [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as PaycheckProfile;
        });

        setPaycheckProfiles(next);
        setPaycheckProfilesLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load paycheck profiles.");
        setPaycheckProfilesLoading(false);
      }
    );

    return () => {
      unsubscribeCategories();
      unsubscribeProfiles();
    };
  }, [authLoading, user]);

  const addCategory = useCallback(async (payload: { name: string; kind: CategoryKind; estimatedMonthly: number }) => {
    if (!user) throw new Error("Not signed in");
    const ref = doc(collection(db, "users", user.uid, "categories"));
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
  }, [user]);

  const updateCategory = useCallback(async (id: string, changes: Partial<Category>) => {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "categories", id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const archiveCategory = useCallback(async (id: string) => {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "categories", id), {
      isArchived: true,
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const addPaycheckProfile = useCallback(async (payload: Omit<PaycheckProfile, "id">) => {
    if (!user) throw new Error("Not signed in");
    const ref = doc(collection(db, "users", user.uid, "paycheckProfiles"));
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const updatePaycheckProfile = useCallback(async (id: string, changes: Partial<PaycheckProfile>) => {
    if (!user) throw new Error("Not signed in");
    await updateDoc(doc(db, "users", user.uid, "paycheckProfiles", id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const getProfileById = useCallback((id: string) => {
    return paycheckProfiles.find((p) => p.id === id) || null;
  }, [paycheckProfiles]);

  return {
    categories,
    paycheckProfiles,
    categoriesLoading,
    paycheckProfilesLoading,
    error,
    addCategory,
    updateCategory,
    archiveCategory,
    addPaycheckProfile,
    updatePaycheckProfile,
    getProfileById,
  };
}

export default useCategories;