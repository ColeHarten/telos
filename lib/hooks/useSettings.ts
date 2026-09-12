"use client";

import { db } from "@/lib/firebaseClient";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import type { AppSettings, AuthUser } from "../types/types";

const DEFAULT_SETTINGS: AppSettings = {
  currency: "USD",
};

/**
 * Small, self-contained hook for the user's app-level preferences
 * (users/{uid}/settings/app). Previously this lived bolted onto
 * useBudget.ts alongside unrelated budget-line logic — pulled out here
 * since nothing else in the app reads settings, so there's no reason for
 * every consumer of budgets to also subscribe to (and re-render on) a
 * settings listener.
 *
 * Also folds in what used to be a separate "ensureUserProfile" call: any
 * time a signed-in user is present, the top-level users/{uid} doc is kept
 * in sync with their auth profile (uid/email/displayName/photoURL). This
 * used to only run when the user happened to visit the Settings page —
 * doing it here means it runs any time this hook is mounted, and doesn't
 * depend on the page it happens to live on.
 */
export function useSettings(user: AuthUser | null, authLoading: boolean) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live settings listener — creates the doc with defaults the first time
  // a user is seen without one.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setSettings(null);
      setSettingsLoading(false);
      return;
    }

    const settingsRef = doc(db, "users", user.uid, "settings", "app");
    setSettingsLoading(true);

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setDoc(settingsRef, {
            ...DEFAULT_SETTINGS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch((err) => {
            console.error("[useSettings] Could not create default settings:", err);
          });
          setSettings(DEFAULT_SETTINGS);
          setSettingsLoading(false);
          return;
        }

        const data = snapshot.data();
        setSettings({
          currency: (data.currency ?? "USD") as AppSettings["currency"],
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
        setSettingsLoading(false);
      },
      (err) => {
        console.error("[useSettings] Failed to load settings:", err);
        setError("Could not load settings.");
        setSettingsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authLoading, user]);

  // Keep the top-level user profile doc in sync (see doc comment above).
  useEffect(() => {
    if (authLoading || !user) return;

    setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      console.error("[useSettings] Could not sync user profile:", err);
    });
  }, [authLoading, user]);

  const updateSettings = useCallback(
    async (changes: Partial<AppSettings>) => {
      if (!user) throw new Error("Not signed in");
      await setDoc(
        doc(db, "users", user.uid, "settings", "app"),
        { ...changes, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },
    [user]
  );

  return { settings, settingsLoading, error, updateSettings };
}

export default useSettings;