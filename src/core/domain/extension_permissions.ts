const PERMISSION_CATEGORIES = [
  'filesystem.read.project',
  'filesystem.write.project',
  'filesystem.read.extension',
  'filesystem.write.extension',
  'network.fetch.http',
  'network.fetch.https',
  'storage.local',
  'storage.global',
  'ai.tool.register',
  'events.subscribe',
  'events.emit',
] as const;

const PERMISSION_PREFIXES = [
  'ipc.call:',
] as const;

export function isValidPermission(perm: string): boolean {
  if (!perm) return false;
  if ((PERMISSION_CATEGORIES as readonly string[]).includes(perm)) return true;
  for (const pref of PERMISSION_PREFIXES) {
    if (perm.startsWith(pref) && perm.length > pref.length) return true;
  }
  return false;
}

export function expandPermissionPattern(grantedPattern: string, requestedPerm: string): boolean {
  if (grantedPattern === requestedPerm) return true;
  if (grantedPattern.endsWith('*')) {
    const prefix = grantedPattern.slice(0, -1);
    return requestedPerm.startsWith(prefix);
  }
  return false;
}

export function checkPermission(granted: readonly string[], requested: string): boolean {
  return granted.some(g => expandPermissionPattern(g, requested));
}

export const ALL_PERMISSIONS = PERMISSION_CATEGORIES;
export type Permission = (typeof PERMISSION_CATEGORIES)[number] | `ipc.call:${string}`;
