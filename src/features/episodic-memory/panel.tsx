"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { StatusSection } from "./components/status-section";
import { SearchLab } from "./components/search-lab";
import { McpTester } from "./components/mcp-tester";
import { BenchmarkRunner } from "./components/benchmark-runner";

type PanelSection = "status" | "search" | "mcp" | "benchmark";

const SECTIONS: { id: PanelSection; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "search", label: "Search Lab" },
  { id: "mcp", label: "MCP Tester" },
  { id: "benchmark", label: "Benchmark" },
];

export default function MemoryLabPanel({ sessionId: _sessionId }: { sessionId: number | null }) {
  const [active, setActive] = useState<PanelSection>("status");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Section nav */}
      <div className="shrink-0 flex items-center gap-1 border-b border-[hsl(var(--border))] px-4 py-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              active === s.id
                ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {active === "status" && <StatusSection />}
        {active === "search" && <SearchLab />}
        {active === "mcp" && <McpTester />}
        {active === "benchmark" && <BenchmarkRunner />}
      </div>
    </div>
  );
}
