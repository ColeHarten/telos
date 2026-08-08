"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebaseClient";
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import type { AuthUser, Category, CategoryKind, Deduction, PaycheckDetails } from "../types/types";

type AddCategoryPayload = {
  name: string;
  kind: CategoryKind;
  estimatedMonthly: number;
  description?: string;
  transferAccountId?: string | null;
  paycheckDetails?: PaycheckDetails | null;
  // Set only when this category is being auto-created by
  // reconcileContributionTransfers, below — never set from the manual
  // category form.
  sourceIncomeCategoryId?: string | null;
  sourceDeductionId?: string | null;
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
            plaidCategories: data.plaidCategories ?? [],
            transferAccountId: data.transferAccountId ?? null,
            sourceIncomeCategoryId: data.sourceIncomeCategoryId ?? null,
            sourceDeductionId: data.sourceDeductionId ?? null,
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
    async (payload: AddCategoryPayload): Promise<string> => {
      if (!user) throw new Error("Not signed in");
      const ref = doc(collection(db, "users", user.uid, "categories"));
      await setDoc(ref, {
        name: payload.name,
        kind: payload.kind,
        estimatedMonthly: payload.estimatedMonthly,
        description: payload.description ?? "",
        transferAccountId: payload.kind === "transfer" ? payload.transferAccountId ?? null : null,
        paycheckDetails: payload.kind === "income" ? payload.paycheckDetails ?? null : null,
        sourceIncomeCategoryId: payload.sourceIncomeCategoryId ?? null,
        sourceDeductionId: payload.sourceDeductionId ?? null,
        sortOrder: Date.now(),
        isDefault: false,
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
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

  // Hard delete — unlike archiveCategory, this is only used for transfer
  // categories auto-created from a paycheck deduction link, once that link
  // is removed. Nothing else in the app depends on a category's continued
  // existence the way it does for accounts, so archiving them would just
  // accumulate dead rows with no way to clean them up later.
  const deleteCategory = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not signed in");
      await deleteDoc(doc(db, "users", user.uid, "categories", id));
    },
    [user]
  );

  /**
   * Reconciles the transfer categories linked to an income category's
   * paycheck deductions, after that income category has been saved.
   *
   * `deductionBreakdown` comes from calculateWithholdings — one entry per
   * deduction that currently has a linkedAccountId. For each entry:
   *   - if a transfer category already exists for that deductionId (found
   *     via sourceDeductionId), its amount/destination are updated in place
   *   - otherwise, a new transfer category is created and stamped with
   *     sourceIncomeCategoryId/sourceDeductionId so it can be found next time
   *
   * Any existing auto-linked transfer category whose deduction is no longer
   * in `deductionBreakdown` (row deleted, or unlinked from an account) is
   * hard-deleted — see deleteCategory above for why archive isn't used here.
   *
   * Call this once, right after saving an income category — pass an empty
   * deductionBreakdown if the category isn't (or is no longer) paycheck-
   * synced, so any previously-linked transfer categories get cleaned up.
   */
  const reconcileContributionTransfers = useCallback(
    async (
      incomeCategoryId: string,
      deductions: Deduction[],
      deductionBreakdown: { deductionId: string; linkedAccountId: string; monthlyAmount: number }[]
    ) => {
      if (!user) throw new Error("Not signed in");

      const existingByDeductionId = new Map(
        categories
          .filter((c) => c.sourceIncomeCategoryId === incomeCategoryId && c.sourceDeductionId)
          .map((c) => [c.sourceDeductionId as string, c])
      );

      const linkedDeductionIds = new Set(deductionBreakdown.map((d) => d.deductionId));

      for (const entry of deductionBreakdown) {
        const deduction = deductions.find((d) => d.id === entry.deductionId);
        const name = deduction ? `${deduction.label} Contribution` : "Paycheck Contribution";
        const existing = existingByDeductionId.get(entry.deductionId);

        if (existing) {
          await updateCategory(existing.id, {
            estimatedMonthly: entry.monthlyAmount,
            transferAccountId: entry.linkedAccountId,
          });
        } else {
          await addCategory({
            name,
            kind: "transfer",
            estimatedMonthly: entry.monthlyAmount,
            transferAccountId: entry.linkedAccountId,
            sourceIncomeCategoryId: incomeCategoryId,
            sourceDeductionId: entry.deductionId,
          });
        }
      }

      for (const [deductionId, category] of existingByDeductionId) {
        if (!linkedDeductionIds.has(deductionId)) {
          await deleteCategory(category.id);
        }
      }
    },
    [user, categories, addCategory, updateCategory, deleteCategory]
  );

  return {
    categories,
    categoriesLoading,
    error,
    addCategory,
    updateCategory,
    archiveCategory,
    deleteCategory,
    reconcileContributionTransfers,
  };
}

export default useCategories;