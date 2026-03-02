export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@core/db";
import { moduleSettings } from "@core/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const settings = db.select().from(moduleSettings)
    .where(eq(moduleSettings.moduleId, id))
    .all();

  const result: Record<string, unknown> = {};
  for (const s of settings) {
    try {
      result[s.key] = JSON.parse(s.value || "null");
    } catch {
      result[s.key] = s.value;
    }
  }
  return NextResponse.json(result);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const db = getDb();

  for (const [key, value] of Object.entries(body)) {
    const jsonValue = JSON.stringify(value);
    const existing = db.select().from(moduleSettings)
      .where(and(eq(moduleSettings.moduleId, id), eq(moduleSettings.key, key)))
      .get();

    if (existing) {
      db.update(moduleSettings)
        .set({ value: jsonValue })
        .where(and(eq(moduleSettings.moduleId, id), eq(moduleSettings.key, key)))
        .run();
    } else {
      db.insert(moduleSettings)
        .values({ moduleId: id, key, value: jsonValue })
        .run();
    }
  }

  return NextResponse.json({ success: true });
}
