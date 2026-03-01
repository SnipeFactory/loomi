import { NextResponse } from "next/server";
import { syncAllWatchedPaths } from "@core/api/sync";

export async function POST() {
  try {
    await syncAllWatchedPaths();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
