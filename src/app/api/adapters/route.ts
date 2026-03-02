export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adapterRegistry } from "@core/adapters/registry";
import { registerBuiltinAdapters } from "@core/adapters/register";

export async function GET() {
  // Next.js runs in a separate process from backend.ts — ensure adapters are registered here too
  if (adapterRegistry.getAllAdapters().length === 0) {
    registerBuiltinAdapters();
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
  }));

  return NextResponse.json({ adapters });
}
