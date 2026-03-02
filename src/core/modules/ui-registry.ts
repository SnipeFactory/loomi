/**
 * Module UI Registry — client-side tab contribution system.
 *
 * Modules register InsightPanel tabs at import time (side-effect imports).
 * app-shell.tsx imports register.tsx files to trigger registration.
 */

import type React from "react";

export interface InsightTabContribution {
  /** Unique identifier (e.g. "episodic-memory") */
  id: string;
  /** Tab label text */
  label: string;
  /** Tab icon component */
  icon: React.ComponentType<{ className?: string }>;
  /** Tab content component — receives the currently selected session ID */
  component: React.ComponentType<{ sessionId: number | null }>;
}

const registry: InsightTabContribution[] = [];

export function registerInsightTab(contribution: InsightTabContribution): void {
  const existing = registry.findIndex((c) => c.id === contribution.id);
  if (existing >= 0) {
    registry[existing] = contribution;
  } else {
    registry.push(contribution);
  }
}

export function getInsightTabs(): InsightTabContribution[] {
  return [...registry];
}
