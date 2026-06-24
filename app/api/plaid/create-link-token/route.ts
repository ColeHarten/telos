import { NextResponse } from "next/server";
import { requireUser } from "@/lib/services/auth";
import { createLinkToken } from "@/lib/services/plaidService";

export async function POST(req: Request) {
  try {
    console.log("Creating link token");
    const user = await requireUser(req);

    const linkToken = await createLinkToken(user.uid);

    return NextResponse.json({ linkToken });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 401 }
    );
  }
}