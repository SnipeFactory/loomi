import type { ModulePermission } from "./types";

/**
 * Check if a set of permissions includes all required permissions.
 */
export function hasPermission(
  granted: ModulePermission[],
  required: ModulePermission
): boolean {
  return granted.includes(required);
}

/**
 * Human-readable descriptions for each permission.
 */
export const permissionDescriptions: Record<ModulePermission, string> = {
  "db:read": "Read session and message data from the database",
  "db:write": "Write module-specific data to the database",
  "network": "Make HTTP requests to external services",
  "filesystem:read": "Read files from the local filesystem",
  "process:spawn": "Spawn whitelisted CLI processes (claude, git, node)",
};
