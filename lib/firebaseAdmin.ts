import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function createFirebaseAdminApp() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawKey) {
    throw new Error(
      "[Firebase Admin] Missing FIREBASE_SERVICE_ACCOUNT_KEY"
    );
  }

  let serviceAccount: any;

  try {
    serviceAccount = JSON.parse(rawKey);
  } catch (err) {
    // Never log the raw env value — on parse failure it still contains the
    // full private key material. Log length/shape only, enough to debug a
    // bad escaping/truncation issue without leaking the secret.
    console.error(
      "[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.",
      `length=${rawKey.length}`,
      `startsWith='${rawKey.slice(0, 12)}...'`
    );
    throw new Error(
      "[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON"
    );
  }

  const requiredFields = [
    "project_id",
    "client_email",
    "private_key",
  ];

  for (const field of requiredFields) {
    if (!serviceAccount[field]) {
      throw new Error(
        `[Firebase Admin] Missing required field: ${field}`
      );
    }
  }

  const privateKey = serviceAccount.private_key?.replace(/\\n/g, "\n");

  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "[Firebase Admin] private_key looks invalid or malformed"
    );
  }

  try {
    return initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey,
      }),
    });
  } catch (err) {
    // This branch is safe to log fully — `err` from initializeApp doesn't
    // contain the raw key material, just SDK-level failure info.
    console.error("[Firebase Admin] initializeApp failed:", err);
    throw err;
  }
}

const app = getApps().length ? getApps()[0] : createFirebaseAdminApp();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);

export default app;