import { NextResponse } from "next/server";
import { adapterRegistry } from "@core/adapters/registry";

export async function GET() {
  const adapters = adapterRegistry.getAllAdapters().map((a) => ({
    id: a.metadata.id,
    name: a.metadata.name,
    version: a.metadata.version,
    provider: a.metadata.provider,
    description: a.metadata.description,
    filePatterns: a.metadata.filePatterns,
    defaultPaths: a.metadata.defaultPaths,
    capabilities: a.metadata.capabilities,
  }));

  return NextResponse.json({ adapters });
}
