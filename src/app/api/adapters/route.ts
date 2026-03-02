export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adapterRegistry } from "@core/adapters/registry";
import { registerBuiltinAdapters, discoverExternalAdapters } from "@core/adapters/discover";

export async function GET() {
  // Next.js runs in a separate process from backend.ts — ensure adapters are registered here too
  try {
    if (adapterRegistry.getAllAdapters().length === 0) {
      registerBuiltinAdapters();
      await discoverExternalAdapters();
    }
  } catch (err) {
    console.error("[Loomi API] Failed to discover adapters in Next.js runtime:", err);
    // 에러가 나더라도 이미 등록된 빌트인 어댑터만이라도 반환하기 위해 계속 진행
  }

  const adapters = adapterRegistry.getAllAdapters().map((a) => ({
    id: a.metadata.id,
    name: a.metadata.name,
    version: a.metadata.version,
    provider: a.metadata.provider,
    description: a.metadata.description,
    filePatterns: a.metadata.filePatterns,
    defaultPaths: a.metadata.defaultPaths,
    capabilities: a.metadata.capabilities,
    supportsUpload: a.metadata.supportsUpload ?? false,
    status: a.metadata.status || "experimental",
  }));

  return NextResponse.json({ adapters });
}
