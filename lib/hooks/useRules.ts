"use client";

import { db } from "@/lib/firebaseClient";
import { parseRule, sortRules } from "@/lib/categorization";
import type { AuthUser, Rule, RuleActions, RuleConditions } from "@/lib/types/types";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

export type RuleDraft = { conditions: RuleConditions; actions: RuleActions };

type Loaded = { uid: string; rules: Rule[]; error: string | null };

/**
 * Your categorization rules, in the order they run (top first). The sync job
 * reads the same docs; see lib/categorization.ts for how they apply.
 */
export default function useRules(user: AuthUser | null, authLoading: boolean) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (authLoading || !uid) return;
    return onSnapshot(
      collection(db, "users", uid, "rules"),
      (snapshot) => {
        const rules: Rule[] = [];
        for (const d of snapshot.docs) {
          const rule = parseRule(d.id, d.data());
          if (rule) rules.push(rule);
        }
        setLoaded({ uid, rules: sortRules(rules), error: null });
      },
      (err) => {
        console.error("[useRules] Failed to load rules:", err);
        setLoaded({ uid, rules: [], error: "Failed to load rules." });
      }
    );
  }, [authLoading, uid]);

  const current = loaded && loaded.uid === uid ? loaded : null;
  const rules = useMemo(() => current?.rules ?? [], [current]);
  const rulesLoading = authLoading || (Boolean(uid) && !current);
  const rulesError = actionError ?? current?.error ?? null;

  /** Adds a rule at the top, so it runs before older ones. Returns its id. */
  const createRule = useCallback(
    async (draft: RuleDraft): Promise<string | null> => {
      if (!uid) return null;
      const top = rules.length > 0 ? Math.min(...rules.map((rule) => rule.priority)) - 1 : 0;
      const ref = doc(collection(db, "users", uid, "rules"));
      try {
        await setDoc(ref, {
          enabled: true,
          priority: Math.round(top),
          conditions: draft.conditions,
          actions: draft.actions,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return ref.id;
      } catch (err) {
        console.error("[useRules] Failed to create rule:", err);
        setActionError("Could not save the rule.");
        return null;
      }
    },
    [uid, rules]
  );

  const updateRule = useCallback(
    async (id: string, draft: RuleDraft): Promise<boolean> => {
      if (!uid) return false;
      try {
        await updateDoc(doc(db, "users", uid, "rules", id), {
          conditions: draft.conditions,
          actions: draft.actions,
          updatedAt: serverTimestamp(),
        });
        return true;
      } catch (err) {
        console.error("[useRules] Failed to update rule:", err);
        setActionError("Could not save the rule.");
        return false;
      }
    },
    [uid]
  );

  const setRuleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      if (!uid) return;
      try {
        await updateDoc(doc(db, "users", uid, "rules", id), { enabled, updatedAt: serverTimestamp() });
      } catch (err) {
        console.error("[useRules] Failed to switch rule:", err);
        setActionError("Could not switch the rule on or off.");
      }
    },
    [uid]
  );

  /** Moves a rule up (-1) or down (1). Priorities are renumbered 0, 1, 2, and so on. */
  const moveRule = useCallback(
    async (id: string, direction: -1 | 1) => {
      if (!uid) return;
      const order = [...rules];
      const from = order.findIndex((rule) => rule.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      const batch = writeBatch(db);
      let writes = 0;
      order.forEach((rule, index) => {
        if (rule.priority === index) return;
        batch.update(doc(db, "users", uid, "rules", rule.id), { priority: index, updatedAt: serverTimestamp() });
        writes += 1;
      });
      if (writes === 0) return;
      try {
        await batch.commit();
      } catch (err) {
        console.error("[useRules] Failed to reorder rules:", err);
        setActionError("Could not reorder the rules.");
      }
    },
    [uid, rules]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await deleteDoc(doc(db, "users", uid, "rules", id));
      } catch (err) {
        console.error("[useRules] Failed to delete rule:", err);
        setActionError("Could not delete the rule.");
      }
    },
    [uid]
  );

  return {
    rules,
    rulesLoading,
    rulesError,
    setRulesError: setActionError,
    createRule,
    updateRule,
    setRuleEnabled,
    moveRule,
    deleteRule,
  };
}
