import { NextResponse } from "next/server";
import { listSessions } from "@core/api/sessions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const result = listSessions({
    tool: searchParams.get("tool") || undefined,
    provider: searchParams.get("provider") || undefined,
    projectPath: searchParams.get("project") || undefined,
    q: searchParams.get("q") || undefined,
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "50"),
  });

  return NextResponse.json(result);
}
