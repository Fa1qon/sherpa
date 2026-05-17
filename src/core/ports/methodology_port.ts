// src/core/ports/methodology_port.ts
import type { Methodology } from '../domain/methodology';

export interface MethodologySummary {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly sourcePath: string;
  /** Parser warnings, e.g. ambiguous edges. Empty for fully-clean parses. */
  readonly warnings: readonly string[];
}

export type LoadMethodologyResult =
  | { readonly ok: true; readonly methodology: Methodology; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: LoadMethodologyError };

export type LoadMethodologyError =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'parse-error'; readonly message: string; readonly line?: number }
  | { readonly kind: 'fs-error'; readonly message: string };

export interface MethodologyPort {
  /** Scan the project's methodologies folder and return per-file summaries. */
  list(projectPath: string): Promise<MethodologySummary[]>;

  /** Load a single methodology by id (resolved against the project's folder). */
  load(projectPath: string, id: string): Promise<LoadMethodologyResult>;

  /** Save (serialize) a methodology back to disk. Edit-mode entry point (Plan 3). */
  save(projectPath: string, m: Methodology): Promise<void>;
}
