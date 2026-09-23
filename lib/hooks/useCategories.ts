"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
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

// Result of checkCategoryIsolation, below. Unlike useAccounts'
// checkAccountIsolation, this never blocks anything — reasons here are
// surfaced as a confirmable warning before archiving, not a hard stop,
// since a category (unlike an account) can always be safely un-archived
// later if something still depends on it.
export type CategoryIsolationCheck = {
  isIsolated: boolean;
  reasons: string[];
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

  /**
   * Checks whether archiving a category would leave anything silently
   * dangling, so the caller can warn the user before proceeding — unlike
   * useAccounts.checkAccountIsolation, this never blocks the action, since
   * archiving a category is always reversible via restoreCategory below.
   *
   * Reasons surfaced:
   *   - The category has transaction history. Those transactions keep their
   *     existing assignment, but the category stops being offered for new
   *     ones (see ruleEngine.ts's applyRules and the Transactions page's
   *     category picker) — worth knowing before archiving something still
   *     actively in use.
   *   - One or more automations still point at this category. They'll stop
   *     having any effect the moment it's archived (see applyRules), rather
   *     than erroring or being cleaned up automatically.
   *   - This is an income category with auto-created, deduction-linked
   *     transfer categories still attached (see reconcileContributionTransfers).
   *     These are archived automatically alongside the parent — see
   *     archiveCategory below — so this reason is informational, not a
   *     problem, but the user should know it's about to happen.
   */
  const checkCategoryIsolation = useCallback(
    async (categoryId: string): Promise<CategoryIsolationCheck> => {
      if (!user) throw new Error("Not signed in");
      const reasons: string[] = [];

      const txSnap = await getDocs(
        query(
          collection(db, "users", user.uid, "transactions"),
          where("categoryId", "==", categoryId),
          limit(1)
        )
      );
      if (!txSnap.empty) {
        reasons.push(
          "It has transaction history. Existing transactions keep their assignment, but this category won't be offered for new ones."
        );
      }

      const automationsSnap = await getDocs(
        query(
          collection(db, "users", user.uid, "automations"),
          where("categoryId", "==", categoryId),
          limit(1)
        )
      );
      if (!automationsSnap.empty) {
        reasons.push(
          "One or more automations point at it. They'll stop assigning new transactions here once it's archived."
        );
      }

      const dependentTransfers = categories.filter(
        (c) => c.sourceIncomeCategoryId === categoryId && !c.isArchived
      );
      if (dependentTransfers.length > 0) {
        const names = dependentTransfers.map((c) => `"${c.name}"`).join(", ");
        reasons.push(
          dependentTransfers.length === 1
            ? `Its linked paycheck-deduction transfer category (${names}) will be archived along with it.`
            : `Its ${dependentTransfers.length} linked paycheck-deduction transfer categories (${names}) will be archived along with it.`
        );
      }

      return { isIsolated: reasons.length === 0, reasons };
    },
    [user, categories]
  );

  /**
   * Archives a category. If it's an income category with auto-created
   * transfer categories still attached (sourceIncomeCategoryId pointing at
   * it — see reconcileContributionTransfers), those are archived in the
   * same batch, so a dependent transfer category is never left active but
   * permanently unreachable in the UI (its own row only ever renders nested
   * under its still-active parent — see the Categories page).
   *
   * Call checkCategoryIsolation first and let the user confirm if it
   * returns any reasons — this function itself always proceeds.
   */
  const archiveCategory = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not signed in");

      const dependents = categories.filter(
        (c) => c.sourceIncomeCategoryId === id && !c.isArchived
      );

      const batch = writeBatch(db);
      const categoriesRef = collection(db, "users", user.uid, "categories");

      batch.update(doc(categoriesRef, id), {
        isArchived: true,
        updatedAt: serverTimestamp(),
      });

      for (const dependent of dependents) {
        batch.update(doc(categoriesRef, dependent.id), {
          isArchived: true,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    },
    [user, categories]
  );

  /**
   * Restores a previously-archived category. Mirrors archiveCategory: if
   * this is an income category whose dependent transfer categories were
   * cascade-archived alongside it, they're restored together too, so the
   * pair never drifts into a state where the parent is active but a
   * deduction-linked transfer category is still (invisibly) archived, or
   * vice versa.
   *
   * `changes` lets the caller restore other fields at the same time (the
   * Categories page currently also re-sends name/kind/estimatedMonthly as
   * a defensive no-op refresh) without a second round trip.
   */
  const restoreCategory = useCallback(
    async (category: Category, changes: Partial<Category> = {}) => {
      if (!user) throw new Error("Not signed in");

      const dependents = categories.filter(
        (c) => c.sourceIncomeCategoryId === category.id && c.isArchived
      );

      const batch = writeBatch(db);
      const categoriesRef = collection(db, "users", user.uid, "categories");

      batch.update(doc(categoriesRef, category.id), {
        ...changes,
        isArchived: false,
        updatedAt: serverTimestamp(),
      });

      for (const dependent of dependents) {
        batch.update(doc(categoriesRef, dependent.id), {
          isArchived: false,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    },
    [user, categories]
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
    restoreCategory,
    checkCategoryIsolation,
    deleteCategory,
    reconcileContributionTransfers,
  };
}

export default useCategories;