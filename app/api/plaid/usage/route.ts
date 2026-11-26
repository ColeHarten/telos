import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/handler";
import { currentPlaidEnv } from "@/lib/services/plaidService";
import { getItemUsage } from "@/lib/services/plaidUsage";
import { RATE_LIMITS } from "@/lib/services/rateLimit";

// How many Plaid connections have been created in this environment, across
// all users, for the Connect a bank screen.
export const GET = withUser({ name: "usage", rateLimit: RATE_LIMITS.usage }, async () => {
  const env = currentPlaidEnv();
  const usage = await getItemUsage(env);
  return NextResponse.json({ env, ...usage });
});
