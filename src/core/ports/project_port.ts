// src/core/ports/project_port.ts
// ProjectPort — main-process service for project metadata + recent list.
// All methods async to allow disk-backed implementations.

import type { Project, RecentEntry } from '../domain/project';

export interface AddProjectOptions {
  /** Absolute path to the project folder. Must exist. */
  readonly path: string;
  /** Display name; default = basename(path). */
  readonly name?: string;
  /** If `.sherpa/` is missing, scaffold it (default: false; caller asks user). */
  readonly scaffold?: boolean;
}

export type AddProjectResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly error: AddProjectError };

export type AddProjectError =
  | { readonly kind: 'path-not-found' }
  | { readonly kind: 'not-a-directory' }
  | { readonly kind: 'sherpa-missing-and-no-scaffold' }
  | { readonly kind: 'duplicate'; readonly existingId: string }
  | { readonly kind: 'fs-error'; readonly message: string };

export interface ProjectPort {
  /** Returns the persisted recent list, sorted by lastOpenedAt desc. */
  listRecent(): Promise<RecentEntry[]>;

  /**
   * Add a project to the recent list. If `scaffold` is true and `.sherpa/` is
   * missing, creates a minimal `.sherpa/` skeleton (just `sherpa.config.json`).
   * Idempotent on path: re-adding an existing project bumps `lastOpenedAt`.
   */
  addProject(opts: AddProjectOptions): Promise<AddProjectResult>;

  /**
   * Mark a project as opened (touches `lastOpenedAt`). Returns the updated
   * Project, or null if the id is unknown.
   */
  open(id: string): Promise<Project | null>;

  /**
   * Remove from the recent list. Does NOT delete the folder or .sherpa/.
   * Returns true if removed; false if id not found.
   */
  removeFromRecent(id: string): Promise<boolean>;

  /** Get a single recent entry by id (or null). */
  get(id: string): Promise<Project | null>;
}
