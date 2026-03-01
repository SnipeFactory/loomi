import fs from "fs";
import path from "path";
import type { ModuleManifest, HookEventName, ModuleSlotId, ModulePermission, ModuleTier } from "./types";

const REQUIRED_FIELDS: (keyof ModuleManifest)[] = [
  "id", "name", "version", "description", "author", "runtime", "serverEntry",
];

const VALID_TIERS: ModuleTier[] = ["explorer"];

const VALID_HOOKS: HookEventName[] = [
  "onLogCaptured", "onSessionEnd", "onSearch", "onModuleInit", "onModuleDestroy",
];

const VALID_SLOTS: ModuleSlotId[] = [
  "sidebar-bottom", "sidebar-sessions-panel", "session-header", "session-footer",
  "main-content", "main-bottom-panel", "settings-section",
];

const VALID_PERMISSIONS: ModulePermission[] = [
  "db:read", "db:write", "network", "filesystem:read", "process:spawn",
];

export function loadManifest(dirPath: string): ModuleManifest {
  const manifestPath = path.join(dirPath, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${dirPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf-8");
  let manifest: ModuleManifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${manifestPath}`);
  }

  validateManifest(manifest);
  return manifest;
}

export function validateManifest(manifest: ModuleManifest): void {
  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) {
      throw new Error(`Module manifest missing required field: ${field}`);
    }
  }

  if (!["server", "client", "both"].includes(manifest.runtime)) {
    throw new Error(`Invalid runtime: ${manifest.runtime}`);
  }

  if (manifest.hooks) {
    for (const hook of manifest.hooks) {
      if (!VALID_HOOKS.includes(hook)) {
        throw new Error(`Invalid hook: ${hook}`);
      }
    }
  }

  if (manifest.slots) {
    for (const slot of manifest.slots) {
      if (!VALID_SLOTS.includes(slot)) {
        throw new Error(`Invalid slot: ${slot}`);
      }
    }
  }

  if (manifest.permissions) {
    for (const perm of manifest.permissions) {
      if (!VALID_PERMISSIONS.includes(perm)) {
        throw new Error(`Invalid permission: ${perm}`);
      }
    }
  }

  // Tier validation
  if (manifest.tier) {
    if (!VALID_TIERS.includes(manifest.tier)) {
      throw new Error(`Invalid tier: ${manifest.tier}. Must be one of: ${VALID_TIERS.join(", ")}`);
    }

    if (manifest.tier === "explorer") {
      if (manifest.permissions?.includes("filesystem:read")) {
        throw new Error("Explorer modules cannot have filesystem:read permission");
      }
    }
  }
}
