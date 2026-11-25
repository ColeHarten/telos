import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebaseClient";

// On first load Firebase Auth restores the session asynchronously, so wait for it.
function getCurrentUser(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) resolve(user);
        else reject(new Error("User not authenticated"));
      },
      (err) => {
        unsubscribe();
        reject(err);
      }
    );
  });
}

/** fetch() with the signed-in user's Firebase ID token attached. */
export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = await getCurrentUser();
  const token = await user.getIdToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers });
}
