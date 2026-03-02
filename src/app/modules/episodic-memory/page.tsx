"use client";

import { ArrowLeft, Database } from "lucide-react";
import MemoryLabPanel from "@features/episodic-memory/panel";

export default function MemoryLabPage() {
  return (
    <div className="h-screen bg-[hsl(var(--background))] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 border-b border-[hsl(var(--border))] px-6 py-3">
        <a
          href="/"
          className="rounded p-1 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
        </a>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-[hsl(var(--primary))]" />
          <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Memory Lab
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        <MemoryLabPanel sessionId={null} />
      </div>
    </div>
  );
}
