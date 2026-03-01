"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { X } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ModuleSettingsDialogProps {
  moduleId: string;
  manifestJson: string;
  onClose: () => void;
}

export function ModuleSettingsDialog({ moduleId, manifestJson, onClose }: ModuleSettingsDialogProps) {
  let schema: any[] = [];
  let moduleName = moduleId;
  try {
    const manifest = JSON.parse(manifestJson);
    schema = manifest.settingsSchema || [];
    moduleName = manifest.name || moduleId;
  } catch {}

  const { data: settings, mutate } = useSWR(`/api/modules/${moduleId}/settings`, fetcher);
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (settings) {
      const initial: Record<string, any> = {};
      for (const field of schema) {
        initial[field.key] = settings[field.key] ?? field.default ?? "";
      }
      setValues(initial);
    }
  }, [settings]);

  const handleSave = async () => {
    if (schema.length > 0) {
      await fetch(`/api/modules/${moduleId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      mutate();
    }
    onClose();
  };

  const hasSettings = schema.length > 0;
  const hasContent = hasSettings;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {moduleName}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Settings fields */}
        {hasSettings && (
          <div className="space-y-3">
            {schema.map((field: any) => (
              <div key={field.key}>
                <label className="text-xs text-[hsl(var(--muted-foreground))]">{field.label}</label>
                {field.type === "boolean" ? (
                  <label className="mt-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!values[field.key]}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-xs text-[hsl(var(--foreground))]">{values[field.key] ? "Enabled" : "Disabled"}</span>
                  </label>
                ) : field.type === "select" ? (
                  <select
                    value={values[field.key] || ""}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    className="mt-1 w-full rounded-md bg-[hsl(var(--muted))] px-2 py-1.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                  >
                    {(field.options || []).map((opt: any) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues({
                      ...values,
                      [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value,
                    })}
                    className="mt-1 w-full rounded-md bg-[hsl(var(--muted))] px-2 py-1.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* No settings at all */}
        {!hasContent && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">No configurable settings.</p>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            {hasSettings ? "Cancel" : "Close"}
          </button>
          {hasSettings && (
            <button
              onClick={handleSave}
              className="rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
