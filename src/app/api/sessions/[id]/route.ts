import { NextResponse } from "next/server";
import { getSessionById } from "@core/api/sessions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");

  const result = getSessionById(parseInt(id), {
    limit,
    beforeSortOrder: before !== null ? parseInt(before) : undefined,
    afterSortOrder: after !== null ? parseInt(after) : undefined,
  });

  if (!result) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
