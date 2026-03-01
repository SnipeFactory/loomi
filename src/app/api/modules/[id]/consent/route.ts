import { NextResponse } from "next/server";
import { hasConsent, grantConsent, revokeConsent, getPendingConsent } from "@core/modules/consent";
import { getModuleRuntime } from "@core/modules/runtime";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const consented = hasConsent(id);
  const pending = getPendingConsent().find((p) => p.moduleId === id);

  return NextResponse.json({
    moduleId: id,
    consented,
    pendingPermissions: pending?.permissions || [],
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runtime = getModuleRuntime();

  await runtime.approveModuleConsent(id);

  return NextResponse.json({ moduleId: id, consented: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  revokeConsent(id);

  const runtime = getModuleRuntime();
  await runtime.disableModule(id);

  return NextResponse.json({ moduleId: id, consented: false });
}
