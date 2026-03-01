import { NextResponse } from "next/server";
import { searchMessagesWithModules } from "@core/api/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const limit = parseInt(searchParams.get("limit") || "20");

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const results = await searchMessagesWithModules({ query: q, limit });

  return NextResponse.json({ results, query: q });
}
