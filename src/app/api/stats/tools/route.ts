export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getToolUsageStats } from "@core/api/messages";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionIdParam = searchParams.get("sessionId");
  const sessionId = sessionIdParam ? Number(sessionIdParam) : undefined;

  const stats = getToolUsageStats(sessionId);
  return NextResponse.json(stats);
}
