export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDb } from "@core/db";
import { modelPricing } from "@core/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  const db = getDb();
  let rows;
  if (provider) {
    rows = db.select().from(modelPricing).where(eq(modelPricing.provider, provider)).all();
  } else {
    rows = db.select().from(modelPricing).all();
  }

  return NextResponse.json({ pricing: rows });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, inputPerMillion, outputPerMillion, cacheWritePerMillion, cacheReadPerMillion } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  db.update(modelPricing)
    .set({
      inputPerMillion,
      outputPerMillion,
      cacheWritePerMillion,
      cacheReadPerMillion,
    })
    .where(eq(modelPricing.id, id))
    .run();

  return NextResponse.json({ ok: true });
}
