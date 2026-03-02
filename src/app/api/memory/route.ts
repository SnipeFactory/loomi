export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { searchMemory, indexSession, indexAll, getIndexingStatus, cleanupNullVectors, cleanupToolResultVectors, cleanupNoiseVectors, searchSessions, indexAllSessionSummaries } from "@core/api/memory";
import { getEmbeddingWorkerClient } from "@core/embeddings/worker-client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "status") {
    const status = getIndexingStatus();
    return NextResponse.json(status);
  }

  if (action === "worker-health") {
    const backendUrl = process.env.LOOMI_BACKEND_URL;
    if (backendUrl) {
      const res = await fetch(`${backendUrl}/api/worker-health`);
      return NextResponse.json(await res.json());
    }
    // Single-process fallback (legacy / no LOOMI_BACKEND_URL)
    const health = getEmbeddingWorkerClient().getWorkerHealth();
    return NextResponse.json(health);
  }

  // Default: search
  const q = searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const target = searchParams.get("target");

  // Session-level search
  if (target === "sessions") {
    const limit = parseInt(searchParams.get("limit") || "10");
    const after = searchParams.get("after") || undefined;
    const before = searchParams.get("before") || undefined;
    const project = searchParams.get("project") || undefined;
    const results = await searchSessions({ query: q, limit, after, before, project });
    return NextResponse.json({ results, query: q });
  }

  // Message-level search (default)
  const mode = (searchParams.get("mode") || "both") as "vector" | "vector-ml" | "text" | "both";
  const limit = parseInt(searchParams.get("limit") || "10");
  const after = searchParams.get("after") || undefined;
  const before = searchParams.get("before") || undefined;
  const project = searchParams.get("project") || undefined;

  const results = await searchMemory({ query: q, mode, limit, after, before, project });
  return NextResponse.json({ results, query: q });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, sessionId } = body;

  if (action === "index-session" && sessionId) {
    const count = await indexSession(sessionId);
    return NextResponse.json({ indexed: count });
  }

  if (action === "index-all") {
    const count = await indexAll();
    return NextResponse.json({ indexed: count });
  }

  if (action === "index-all-summaries") {
    const count = await indexAllSessionSummaries();
    return NextResponse.json({ indexed: count });
  }

  if (action === "cleanup-null-vectors") {
    const deleted = cleanupNullVectors();
    return NextResponse.json({ deleted });
  }

  if (action === "cleanup-tool-results") {
    const result = cleanupToolResultVectors();
    return NextResponse.json(result);
  }

  if (action === "cleanup-noise") {
    const result = cleanupNoiseVectors();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
