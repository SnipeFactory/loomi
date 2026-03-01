import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@core/db";
import { modules } from "@core/db/schema";
import { getModuleRuntime } from "@core/modules/runtime";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const mod = db.select().from(modules).where(eq(modules.moduleId, id)).get();
  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const runtime = getModuleRuntime();
  const instance = runtime.getModule(id);

  return NextResponse.json({
    ...mod,
    status: instance?.status || "unloaded",
    error: instance?.error,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runtime = getModuleRuntime();
  await runtime.unloadModule(id);

  const db = getDb();
  db.delete(modules).where(eq(modules.moduleId, id)).run();

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const runtime = getModuleRuntime();

  if (body.enabled === true) {
    await runtime.enableModule(id);
  } else if (body.enabled === false) {
    await runtime.disableModule(id);
  }

  const instance = runtime.getModule(id);
  return NextResponse.json({
    moduleId: id,
    status: instance?.status || "unloaded",
    enabled: body.enabled,
  });
}
