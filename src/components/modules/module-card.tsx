"use client";

import { useState } from "react";
import { Power, Settings, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import type { Module } from "@/types/domain";

interface ModuleCardProps {
  module: Module;
  onToggle: (moduleId: string, enabled: boolean) => void;
  onDelete: (moduleId: string) => void;
  onSettings: (moduleId: string) => void;
}

export function ModuleCard({ module, onToggle, onDelete, onSettings }: ModuleCardProps) {
  const [loading, setLoading] = useState(false);
  let manifest: any = {};
  try {
    manifest = JSON.parse(module.manifestJson);
  } catch {}

  const handleToggle = async () => {
    setLoading(true);
    await onToggle(module.moduleId, !module.enabled);
    setLoading(false);
  };

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm text-[hsl(var(--foreground))]">
              {module.name}
            </h3>
            {module.isPremium && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                Premium
              </span>
            )}
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              v{module.version}
            </span>
          </div>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            {manifest.description || "No description"}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
            <span>by {manifest.author || "Unknown"}</span>
            {manifest.permissions?.length > 0 && (
              <span className="text-[hsl(var(--muted-foreground))]">
                {manifest.permissions.length} permissions
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          {module.enabled ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 border-t border-[hsl(var(--border))] pt-3">
        <button
          onClick={handleToggle}
          disabled={loading}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
            module.enabled
              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
              : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
        >
          <Power className="h-3 w-3" />
          {module.enabled ? "Disable" : "Enable"}
        </button>
        <button
          onClick={() => onSettings(module.moduleId)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <Settings className="h-3 w-3" />
          Settings
        </button>
        <button
          onClick={() => onDelete(module.moduleId)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
