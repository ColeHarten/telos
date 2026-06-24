import { adminAuth } from "@/lib/firebaseAdmin";

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing Authorization header");
  }

  const token = authHeader.substring("Bearer ".length);

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded; // contains uid
  } catch (err) {
    throw new Error("Invalid token");
  }
}