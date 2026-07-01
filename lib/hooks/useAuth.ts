"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import type { AuthUser } from "../types/types";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(
        nextUser
          ? {
              uid: nextUser.uid,
              email: nextUser.email,
              displayName: nextUser.displayName,
              photoURL: nextUser.photoURL,
            }
          : null
      );
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, authLoading };
}

export default useAuth;
