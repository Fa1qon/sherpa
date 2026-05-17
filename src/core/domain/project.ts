// src/core/domain/project.ts
// Project domain — represents a Sherpa-managed folder on disk.

export interface Project {
  /** Stable id, e.g. UUID, used as primary key in Recent list. */
  readonly id: string;
  /** Display name (default = basename of path; user-editable later). */
  readonly name: string;
  /** Absolute path to the project root. */
  readonly path: string;
  /** ISO 8601 timestamp the project was first added to Sherpa. */
  readonly addedAt: string;
  /** ISO 8601 timestamp of the last open. Optional — undefined for never-opened. */
  readonly lastOpenedAt?: string;
}

/**
 * RecentEntry — the slimmer projection persisted into recent-projects.json.
 * Excludes addedAt (only used for first-add audit, not for recent display).
 */
export interface RecentEntry {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly lastOpenedAt?: string;
}

/**
 * Structural shape guard. Verifies field presence + types only — does NOT
 * validate semantic correctness (e.g., that `addedAt` is a real ISO timestamp
 * or that `path` resolves). Callers needing semantic validation should layer
 * checks on top.
 */
export function isProject(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.path === 'string' &&
    typeof v.addedAt === 'string' &&
    (v.lastOpenedAt === undefined || typeof v.lastOpenedAt === 'string')
  );
}

export function toRecentEntry(p: Project): RecentEntry {
  return {
    id: p.id,
    name: p.name,
    path: p.path,
    ...(p.lastOpenedAt !== undefined && { lastOpenedAt: p.lastOpenedAt }),
  };
}
