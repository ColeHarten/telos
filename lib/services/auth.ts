import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebaseAdmin";

/** The request has no valid Firebase ID token. API routes map this to 401. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireUser(req: Request): Promise<DecodedIdToken> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new AuthError("Missing bearer token");

  // Created outside the try so configuration errors surface as 500s, not 401s.
  const firebaseAuth = getAdminAuth();
  try {
    // checkRevoked rejects tokens for disabled or signed-out-everywhere users.
    return await firebaseAuth.verifyIdToken(token, true);
  } catch {
    throw new AuthError("Invalid, expired, or revoked token");
  }
}
