import { auth } from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

function getCurrentUser(): Promise<any> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        unsub();
        if (user) resolve(user);
        else reject(new Error("User not authenticated"));
      },
      reject
    );
  });
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const user = await getCurrentUser();

  const token = await user.getIdToken();

  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}