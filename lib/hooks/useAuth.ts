"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, authLoading };
}

export default useAuth;
