"use client";

import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { normalizeMerchant } from "@/lib/merchant";
import type { AuthUser, Automation } from "../types/types";

export default function useAutomations(user: AuthUser | null, authLoading: boolean) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationsLoading, setAutomationsLoading] = useState(true);
  const [automationsError, setAutomationsError] = useState<string | null>(null);

  const fetchAutomations = useCallback(async () => {
    if (authLoading || !user?.uid) return;

    setAutomationsLoading(true);
    setAutomationsError(null);

    try {
      const colRef = collection(db, "users", user.uid, "automations");
      const snapshot = await getDocs(colRef);

      const fetched: Automation[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Automation, "id">;
        return { id: docSnap.id, ...data };
      });

      setAutomations(fetched);
    } catch (err) {
      console.error("[useAutomations] Failed to fetch automations:", err);
      setAutomationsError("Failed to fetch automations.");
    } finally {
      setAutomationsLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  /**
   * Creates (or overwrites) a merchant -> category automation. `merchantText`
   * should be the same string a transaction's display name was resolved
   * from — i.e. a Transaction's `displayName` (merchantName ?? rawName) —
   * so the normalized key here matches the key the Plaid sync job computes
   * at ingest time (see ruleEngine.ts's applyRules).
   *
   * Uses the normalized merchant key as the doc id, so creating an
   * automation for a merchant that already has one overwrites it rather
   * than creating a duplicate.
   */
  const createAutomation = useCallback(
    async (merchantText: string, categoryId: string): Promise<boolean> => {
      if (!user?.uid) return false;

      const merchantKey = normalizeMerchant(merchantText);
      if (!merchantKey) {
        console.error("[useAutomations] Cannot create automation: merchant text normalized to an empty key.");
        setAutomationsError("Couldn't create automation for that transaction.");
        return false;
      }

      const automation: Omit<Automation, "id"> = {
        merchantKey,
        merchantLabel: merchantText.trim(),
        categoryId,
        createdAt: serverTimestamp(),
      };

      try {
        const ref = doc(db, "users", user.uid, "automations", merchantKey);
        await setDoc(ref, automation);

        setAutomations((prev) => [...prev.filter((a) => a.id !== merchantKey), { id: merchantKey, ...automation }]);

        return true;
      } catch (err) {
        console.error("[useAutomations] Failed to create automation:", err);
        setAutomationsError("Failed to create automation.");
        return false;
      }
    },
    [user]
  );

  const deleteAutomation = useCallback(
    async (id: string) => {
      if (!user?.uid) return;

      const previous = automations;
      setAutomations((prev) => prev.filter((a) => a.id !== id));

      try {
        const ref = doc(db, "users", user.uid, "automations", id);
        await deleteDoc(ref);
      } catch (err) {
        console.error("[useAutomations] Failed to delete automation:", err);
        setAutomationsError("Failed to delete automation.");
        setAutomations(previous); // revert optimistic update
      }
    },
    [user, automations]
  );

  return {
    automations,
    automationsLoading,
    automationsError,
    setAutomationsError,
    refetchAutomations: fetchAutomations,
    createAutomation,
    deleteAutomation,
  };
}