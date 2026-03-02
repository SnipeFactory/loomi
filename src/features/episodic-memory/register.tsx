"use client";

/**
 * Side-effect import: registers the Memory Lab tab into the InsightPanel.
 * Imported by app-shell.tsx at startup.
 */

import { lazy } from "react";
import { Database } from "lucide-react";
import { registerInsightTab } from "@core/modules/ui-registry";

const MemoryLabPanel = lazy(() => import("./panel"));

registerInsightTab({
  id: "episodic-memory",
  label: "Memory Lab",
  icon: Database,
  component: MemoryLabPanel,
});
