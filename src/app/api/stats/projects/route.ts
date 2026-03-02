export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getProjectUsageStats } from "@core/api/sessions";
import { getSessionById } from "@core/api/sessions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionIdParam = searchParams.get("sessionId");

  if (sessionIdParam) {
    // Return single-session usage summary
    const detail = getSessionById(Number(sessionIdParam));
    if (!detail) return NextResponse.json([]);

    const s = detail.session;
    return NextResponse.json([{
      projectPath: s.projectPath || "(no project)",
      sessionCount: 1,
      messageCount: s.userMessageCount + s.assistantMessageCount,
      totalInputTokens: s.totalInputTokens,
      totalOutputTokens: s.totalOutputTokens,
      totalCost: s.estimatedCostUsd,
      lastActivityAt: s.lastActivityAt,
    }]);
  }

  const stats = getProjectUsageStats();
  return NextResponse.json(stats);
}
