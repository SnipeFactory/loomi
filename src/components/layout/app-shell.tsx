"use client";

import { useState, Suspense, lazy } from "react";
import { SidebarPaths } from "./sidebar-paths";
import "@features/episodic-memory/register";

const InsightPanel = lazy(() => import("@features/session-explorer/components/insight-panel"));
const SidebarSessions = lazy(() =>
  import("@features/session-explorer/components/sidebar-sessions").then(
    (m) => ({ default: m.SidebarSessions })
  )
);

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]">
      <p className="text-sm">Loading...</p>
    </div>
  );
}

export function AppShell() {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* Sidebar 1: Paths */}
      <div className="w-[220px] shrink-0">
        <SidebarPaths />
      </div>

      {/* Sidebar 2: Sessions */}
      <div className="w-[320px] shrink-0">
        <Suspense fallback={<Loading />}>
          <SidebarSessions
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
          />
        </Suspense>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <Suspense fallback={<Loading />}>
          <InsightPanel sessionId={activeSessionId} />
        </Suspense>
      </div>
    </div>
  );
}
