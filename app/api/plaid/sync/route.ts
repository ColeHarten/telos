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
    console.error("[sync] FAILED:", err);

    return NextResponse.json(
      {
        error: "Sync failed",
        message: err?.message,
        stack: err?.stack,
      },
      { status: 500 }
    );
  }
}