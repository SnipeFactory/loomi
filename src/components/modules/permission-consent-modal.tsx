"use client";

import { useState } from "react";
import { Shield, X, AlertTriangle } from "lucide-react";

const PERMISSION_LABELS: Record<string, { label: string; description: string; risk: "low" | "medium" | "high" }> = {
  "db:read": {
    label: "Database Read",
    description: "Read session and message data (scrubbed for sensitive content)",
    risk: "low",
  },
  "db:write": {
    label: "Database Write",
    description: "Write module-specific data to the database",
    risk: "medium",
  },
  "network": {
    label: "Network Access",
    description: "Make HTTP requests to external services",
    risk: "high",
  },
  "process:spawn": {
    label: "Process Spawn",
    description: "Spawn whitelisted CLI processes",
    risk: "high",
  },
};

interface PermissionConsentModalProps {
  moduleId: string;
  moduleName: string;
  permissions: string[];
  onApprove: () => void;
  onDeny: () => void;
  onClose: () => void;
}

export function PermissionConsentModal({
  moduleId,
  moduleName,
  permissions,
  onApprove,
  onDeny,
  onClose,
}: PermissionConsentModalProps) {
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    await onApprove();
    setLoading(false);
  };

  const riskColor = (risk: "low" | "medium" | "high") => {
    switch (risk) {
      case "low": return "text-green-400";
      case "medium": return "text-yellow-400";
      case "high": return "text-red-400";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Permission Request
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Module info */}
        <div className="mb-4 rounded-md bg-[hsl(var(--muted))] p-3">
          <div className="text-sm font-medium text-[hsl(var(--foreground))]">{moduleName}</div>
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{moduleId}</div>
        </div>

        {/* Warning */}
        <div className="mb-4 flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80">
            This module is requesting the following permissions. Explorer modules access your data through a security scrubber that redacts sensitive information.
          </p>
        </div>

        {/* Permissions list */}
        <div className="space-y-2 mb-5">
          {permissions.map((perm) => {
            const info = PERMISSION_LABELS[perm] || {
              label: perm,
              description: "Unknown permission",
              risk: "high" as const,
            };
            return (
              <div
                key={perm}
                className="flex items-start gap-3 rounded-md border border-[hsl(var(--border))] p-2.5"
              >
                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                  info.risk === "low" ? "bg-green-400" :
                  info.risk === "medium" ? "bg-yellow-400" : "bg-red-400"
                }`} />
                <div>
                  <div className="text-xs font-medium text-[hsl(var(--foreground))]">
                    {info.label}
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    {info.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onDeny}
            className="rounded-md px-4 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
          >
            Deny
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-1.5 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Approving..." : "Approve All"}
          </button>
        </div>
      </div>
    </div>
  );
}
