"use client";

import { ArrowLeft, Database } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto max-w-2xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <a
            href="/"
            className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </a>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            General application settings and system information.
          </p>
        </div>

        {/* Database info */}
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
            <Database className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <h2 className="text-sm font-semibold">Database</h2>
          </div>
          <div className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
            <div className="flex items-center justify-between py-1">
              <span>Location</span>
              <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5">data/loomi.db</code>
            </div>
            <div className="flex items-center justify-between py-1">
              <span>Engine</span>
              <span>SQLite (WAL mode)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
