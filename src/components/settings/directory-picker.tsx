"use client";

import { useState, useEffect } from "react";
import {
  Folder,
  ChevronRight,
  ArrowUp,
  Check,
  X,
  Home,
  Terminal,
  Zap,
} from "lucide-react";

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  current: string;
  parent: string;
  dirs: DirEntry[];
  error?: string;
}

interface KnownSource {
  id: string;
  name: string;
  description: string;
  defaultPath: string;
  exists: boolean;
  icon: string;
}

interface PlatformInfo {
  platform: string;
  home: string;
  sources: KnownSource[];
}

export function DirectoryPicker({
  onSelect,
  onCancel,
}: {
  onSelect: (path: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"suggestions" | "browse">("suggestions");
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);

  // Browse state
  const [currentPath, setCurrentPath] = useState<string>("");
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [parentPath, setParentPath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform")
      .then((r) => r.json())
      .then(setPlatformInfo)
      .catch(() => setMode("browse"));
  }, []);

  const browse = async (dirPath?: string) => {
    setMode("browse");
    setLoading(true);
    setError(null);
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
    try {
      const res = await fetch(`/api/browse${params}`);
      const data: BrowseResult = await res.json();
      setCurrentPath(data.current);
      setParentPath(data.parent);
      setDirs(data.dirs || []);
      if (data.error) setError(data.error);
    } catch {
      setError("Failed to browse directory");
    }
    setLoading(false);
  };

  // ── Suggestions mode ──
  if (mode === "suggestions" && platformInfo) {
    return (
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        {/* Platform badge */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2 bg-[hsl(var(--muted))]">
          <span className="text-xs font-medium text-[hsl(var(--foreground))]">
            Detected: {platformInfo.platform}
          </span>
          <button
            onClick={() => browse()}
            className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] underline"
          >
            Browse manually
          </button>
        </div>

        {/* Known sources */}
        <div className="divide-y divide-[hsl(var(--border))]">
          {platformInfo.sources.map((source) => (
            <button
              key={source.id}
              onClick={() => onSelect(source.defaultPath)}
              disabled={!source.exists}
              className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                <Terminal className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {source.name}
                  </span>
                  {source.exists ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      <Zap className="h-2.5 w-2.5" />
                      Found
                    </span>
                  ) : (
                    <span className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                      Not found
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  {source.description}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))] opacity-70 truncate">
                  {source.defaultPath}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] opacity-40" />
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div className="flex justify-end border-t border-[hsl(var(--border))] px-3 py-2 bg-[hsl(var(--muted))]">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Browse mode ──
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      {/* Navigation bar */}
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2 bg-[hsl(var(--muted))]">
        {platformInfo && (
          <button
            onClick={() => setMode("suggestions")}
            className="rounded p-1 hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            title="Back to suggestions"
          >
            <Zap className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => browse()}
          className="rounded p-1 hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          title="Home"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => browse(parentPath)}
          disabled={currentPath === parentPath}
          className="rounded p-1 hover:bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-30"
          title="Up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0 text-xs text-[hsl(var(--foreground))] font-mono truncate">
          {currentPath}
        </div>
      </div>

      {/* Directory listing */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
            Loading...
          </div>
        ) : error ? (
          <div className="p-4 text-center text-xs text-red-400">{error}</div>
        ) : dirs.length === 0 ? (
          <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
            No subdirectories
          </div>
        ) : (
          dirs.map((dir) => (
            <button
              key={dir.path}
              onClick={() => browse(dir.path)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[hsl(var(--muted))] transition-colors"
            >
              <Folder className="h-4 w-4 shrink-0 text-blue-400" />
              <span className="truncate text-sm text-[hsl(var(--foreground))]">
                {dir.name}
              </span>
              <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))] opacity-40" />
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[hsl(var(--border))] px-3 py-2 bg-[hsl(var(--muted))]">
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          Navigate to a folder, then select it
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            onClick={() => onSelect(currentPath)}
            disabled={!currentPath}
            className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Select This Folder
          </button>
        </div>
      </div>
    </div>
  );
}
