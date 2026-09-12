import { NextResponse } from "next/server";
import { requireUser } from "@/lib/services/auth";
import { syncAllPlaidItems } from "@/lib/services/syncService";

export async function POST(req: Request) {
  try {
    console.log("[sync] starting");

    const user = await requireUser(req);
    console.log("[sync] user:", user?.uid);

    const result = await syncAllPlaidItems(user.uid);

    console.log("[sync] success");

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    // Log full details server-side only — never return stack traces or
    // internal error messages to the client, since that leaks file paths
    // and implementation details to anyone who can trigger a failed sync.
    console.error("[sync] FAILED:", err);

    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}