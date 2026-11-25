import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/handler";
import { createLinkToken } from "@/lib/services/plaidService";
import { RATE_LIMITS } from "@/lib/services/rateLimit";

export const POST = withUser({ name: "create-link-token", rateLimit: RATE_LIMITS.linkToken }, async ({ user }) => {
  const linkToken = await createLinkToken(user.uid);
  return NextResponse.json({ linkToken });
});
