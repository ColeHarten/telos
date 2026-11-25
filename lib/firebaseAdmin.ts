import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function createFirebaseAdminApp(): App {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    throw new Error("[Firebase Admin] Missing FIREBASE_SERVICE_ACCOUNT_KEY");
  }

  let serviceAccount: ServiceAccountJson;
  try {
    serviceAccount = JSON.parse(rawKey) as ServiceAccountJson;
  } catch {
    // Never log the raw value: it contains the private key.
    console.error(`[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON (length=${rawKey.length}).`);
    throw new Error("[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }

  const projectId = serviceAccount.project_id;
  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("[Firebase Admin] Service account is missing project_id, client_email, or private_key");
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("[Firebase Admin] private_key looks malformed");
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function getAdminApp(): App {
  return getApps()[0] ?? createFirebaseAdminApp();
}

// Created on first use, so `next build` and tests don't need credentials.
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
