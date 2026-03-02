export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDb } from "@core/db";
import { modules } from "@core/db/schema";
import { getModuleRuntime } from "@core/modules/runtime";

export async function GET(_request: Request) {
  const db = getDb();
  const allModules = db.select().from(modules).all();
  return NextResponse.json(allModules);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { dirPath } = body;

  if (!dirPath) {
    return NextResponse.json({ error: "dirPath is required" }, { status: 400 });
  }

  try {
    const runtime = getModuleRuntime();
    const { loadManifest } = await import("@core/modules/manifest");
    const manifest = loadManifest(dirPath);
    await runtime.registerModule(manifest, dirPath);
    return NextResponse.json({ success: true, moduleId: manifest.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to install module" },
      { status: 400 }
    );
  }
}
