"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import type { AuthUser, Category, CategoryKind, PaycheckDetails } from "../types/types";

type AddCategoryPayload = {
  name: string;
  kind: CategoryKind;
  estimatedMonthly: number;
  description?: string;
  keywords?: string[];
  transferAccountId?: string | null;
  paycheckDetails?: PaycheckDetails | null;
};

export function useCategories(user: AuthUser | null, authLoading: boolean) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setCategories([]);
      setCategoriesLoading(false);
      return;
    }

    setCategoriesLoading(true);

    const categoriesQuery = collection(db, "users", user.uid, "categories");

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
            groupId: data.groupId ?? null,
            description: data.description ?? "",
            keywords: data.keywords ?? [],
            plaidCategories: data.plaidCategories ?? [],
            transferAccountId: data.transferAccountId ?? null,
            paycheckDetails: data.paycheckDetails ?? null,
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

    return () => {
      unsubscribeCategories();
    };
  }, [authLoading, user]);

  const addCategory = useCallback(
    async (payload: AddCategoryPayload) => {
      if (!user) throw new Error("Not signed in");
      const ref = doc(collection(db, "users", user.uid, "categories"));
      await setDoc(ref, {
        name: payload.name,
        kind: payload.kind,
        estimatedMonthly: payload.estimatedMonthly,
        description: payload.description ?? "",
        keywords: payload.keywords ?? [],
        transferAccountId: payload.kind === "transfer" ? payload.transferAccountId ?? null : null,
        paycheckDetails: payload.kind === "income" ? payload.paycheckDetails ?? null : null,
        sortOrder: Date.now(),
        isDefault: false,
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  const updateCategory = useCallback(
    async (id: string, changes: Partial<Category>) => {
      if (!user) throw new Error("Not signed in");
      await updateDoc(doc(db, "users", user.uid, "categories", id), {
        ...changes,
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  const archiveCategory = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not signed in");
      await updateDoc(doc(db, "users", user.uid, "categories", id), {
        isArchived: true,
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  return {
    categories,
    categoriesLoading,
    error,
    addCategory,
    updateCategory,
    archiveCategory,
  };
}

export default useCategories;