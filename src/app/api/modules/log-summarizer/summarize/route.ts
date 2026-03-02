export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getModuleRuntime } from "@core/modules/runtime";

interface SummarizerResult {
  summary: string;
  keywords: string;
  code?: string;
}

interface SummarizerModule {
  summarize: (sessionId: number, sessionUuid: string) => Promise<SummarizerResult | null>;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { sessionId, sessionUuid } = body;

  if (!sessionId || !sessionUuid) {
    return NextResponse.json({ error: "sessionId and sessionUuid are required" }, { status: 400 });
  }

  const runtime = getModuleRuntime();
  const mod = runtime.getModuleExports<SummarizerModule>("log-summarizer");

  if (!mod?.summarize) {
    return NextResponse.json(
      { error: "Session Summarizer module is not loaded. Enable it in Modules settings." },
      { status: 503 }
    );
  }

  try {
    const result = await mod.summarize(sessionId, sessionUuid);

    if (!result) {
      return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
    }

    // Handle error codes from the module
    if (result.code === "NO_API_KEY") {
      return NextResponse.json(
        { error: "OpenRouter API key not configured", code: "NO_API_KEY" },
        { status: 400 }
      );
    }

    if (result.code === "NO_CONTENT") {
      return NextResponse.json(
        { error: "No message content to summarize", code: "NO_CONTENT" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate summary" },
      { status: 500 }
    );
  }
}
