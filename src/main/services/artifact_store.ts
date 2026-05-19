// src/main/services/artifact_store.ts
// Plan 8 Task 15 — concrete ArtifactStore.
//
// Writes a stage's produced artifact under
// `<projectPath>/.sherpa/tasks/<taskId>/chat_NN/<spec.path>`, honouring
// the two IR-level features Plan 8 added to ArtifactSpec:
//
//   conditional_paths
//     Alternate output paths gated by a ConditionExpr against the
//     produced artifact's frontmatter. First match wins; no match
//     falls back to `spec.path`.
//
//   invariants
//     Frontmatter-shaping rules. When `when` holds (again, evaluated
//     against the artifact's own frontmatter), apply `op` to
//     `enforce_field`: `cap` clamps from above (numeric), `floor`
//     clamps from below (numeric), `set` overwrites unconditionally.
//
// Both features parse the artifact via `gray-matter`. Content without
// frontmatter is treated as a plain body: conditional paths simply
// won't match (their `when` exprs reference `artifact.<field>`), and
// invariants are skipped with a console.warn so authors notice.
//
// Atomic writes via the shared `atomicWrite` helper (tmp + fsync + rename).
//
// Strict TS; no IPC.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';

import { atomicWrite } from '../../core/infrastructure/atomic_write';
import {
  parseConditionExpr,
} from '../../core/domain/condition_expr';
import {
  evaluateConditionExpr,
  type EvaluatorContext,
} from '../../core/domain/condition_expr_evaluator';
import type {
  ArtifactInvariant,
  ArtifactSpec,
  ConditionalPath,
} from '../../core/domain/methodology';
import type { EventBus } from './event_bus';
import type { PluginExecutor } from '../plugins/plugin_executor';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface ArtifactWriteContext {
  readonly projectPath: string;
  readonly taskId: string;
  /**
   * The current chat session number (zero-padded 2-digit suffix in the
   * `chat_NN` directory). Defaults to 1 if absent — useful for fresh tasks.
   */
  readonly chatNum?: number;
  /**
   * Override the artifact root (i.e. the directory that contains `chat_NN/`).
   * Defaults to `<projectPath>/.sherpa/tasks/<taskId>`.
   */
  readonly artifactRoot?: string;
}

export interface ArtifactWriteResult {
  readonly path: string;
}

/**
 * Logger interface for non-fatal warnings (missing frontmatter when
 * invariants are set, ConditionExpr parse failures, etc.). The default
 * uses the global `console`; tests inject a recorder.
 */
export interface WarnLogger {
  warn(msg: string, meta?: Record<string, unknown>): void;
}

const defaultWarnLogger: WarnLogger = {
  warn(msg, meta) {
    if (meta !== undefined) {
      // eslint-disable-next-line no-console
      console.warn(`[ArtifactStore] ${msg}`, meta);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[ArtifactStore] ${msg}`);
    }
  },
};

export interface ArtifactStoreOptions {
  readonly logger?: WarnLogger;
  /**
   * Skip fsync inside atomicWrite — speeds up tests on slow disks.
   * Default: false (fsync on).
   */
  readonly noFsync?: boolean;
  /** Plan 02 — optional EventBus for artifact.written events. */
  readonly bus?: EventBus | null;
  /** Track C Plan 02 — optional pipeline plugin executor. */
  readonly pluginExecutor?: PluginExecutor | null;
}

// ---------------------------------------------------------------------------
// ArtifactStoreImpl
// ---------------------------------------------------------------------------

export class ArtifactStoreImpl {
  private readonly logger: WarnLogger;
  private readonly noFsync: boolean;
  private readonly bus: EventBus | null;
  private readonly pluginExecutor: PluginExecutor | null;

  constructor(opts: ArtifactStoreOptions = {}) {
    this.logger = opts.logger ?? defaultWarnLogger;
    this.noFsync = opts.noFsync ?? false;
    this.bus = opts.bus ?? null;
    this.pluginExecutor = opts.pluginExecutor ?? null;
  }

  /**
   * Write a produced artifact according to its `ArtifactSpec`.
   *
   *  1. Parse frontmatter (gray-matter) — empty `{}` if none present.
   *  2. Apply invariants to mutate frontmatter (cap/floor/set) where their
   *     `when` expr matches.
   *  3. Re-serialize content if invariants mutated anything.
   *  4. Resolve target via conditional_paths (first match wins) or fall
   *     back to `spec.path`.
   *  5. Atomic write (mkdir -p + tmp + rename).
   */
  async writeArtifact(
    spec: ArtifactSpec,
    content: string,
    ctx: ArtifactWriteContext,
  ): Promise<ArtifactWriteResult> {
    const artifactRoot =
      ctx.artifactRoot ??
      path.join(ctx.projectPath, '.sherpa', 'tasks', ctx.taskId);
    const chatDir = `chat_${String(ctx.chatNum ?? 1).padStart(2, '0')}`;

    // --- Step 1: parse frontmatter -----------------------------------
    const parsed = matter(content);
    const originalHasFrontmatter = hasFrontmatterMarker(content);
    const frontmatter: Record<string, unknown> = {
      ...((parsed.data as Record<string, unknown> | undefined) ?? {}),
    };
    const body = parsed.content ?? '';

    // --- Step 2 + 3: invariants --------------------------------------
    let mutatedFrontmatter = false;
    if (spec.invariants && spec.invariants.length > 0) {
      if (!originalHasFrontmatter) {
        this.logger.warn(
          'invariants declared but artifact has no frontmatter — skipping invariants',
          { artifactPath: spec.path },
        );
      } else {
        for (const inv of spec.invariants) {
          const fired = this.evalArtifactExpr(inv.when.expr, frontmatter);
          if (!fired) continue;
          if (this.applyInvariant(frontmatter, inv)) {
            mutatedFrontmatter = true;
          }
        }
      }
    }

    // --- Step 4: conditional path resolution -------------------------
    const chosenRelative = this.pickPath(spec, frontmatter);
    const targetAbs = path.join(artifactRoot, chatDir, chosenRelative);

    // --- Step 5: re-serialize if needed, then atomic write -----------
    const finalContent =
      mutatedFrontmatter || (originalHasFrontmatter && !spec.invariants?.length)
        ? rebuildWithFrontmatter(frontmatter, body, originalHasFrontmatter, content)
        : content;

    await fsp.mkdir(path.dirname(targetAbs), { recursive: true });
    await atomicWrite(targetAbs, finalContent, { fsync: !this.noFsync });

    // Plan 02 — typed artifact.written event. Size is byte length of the
    // final content (post-invariant rewrite, post-frontmatter merge).
    const finalSize = Buffer.byteLength(finalContent, 'utf8');
    this.bus?.emit({
      type: 'artifact.written',
      ts: Date.now(),
      taskId: ctx.taskId,
      artifactPath: targetAbs,
      size: finalSize,
    });

    // Track C Plan 02 — plugin dispatch on artifact creation.
    await this.pluginExecutor?.dispatch('on_artifact_created', {
      hook: 'on_artifact_created',
      task: { id: ctx.taskId, workdir: ctx.projectPath },
      artifact: { path: targetAbs, size: finalSize },
      event: {},
      timestamp: Date.now(),
    });

    return { path: targetAbs };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Returns the relative path inside `chat_NN/` to write to. */
  private pickPath(
    spec: ArtifactSpec,
    frontmatter: Record<string, unknown>,
  ): string {
    if (!spec.conditional_paths || spec.conditional_paths.length === 0) {
      return spec.path;
    }
    for (const cp of spec.conditional_paths) {
      if (this.evalArtifactExpr(cp.when.expr, frontmatter)) {
        return resolveConditionalPath(cp, spec);
      }
    }
    return spec.path;
  }

  /**
   * Evaluate a ConditionExpr against an artifact-only context.
   * Parse failures and runtime errors degrade to `false` — same
   * conservative posture the runner uses for branch edges.
   */
  private evalArtifactExpr(
    expr: string,
    frontmatter: Record<string, unknown>,
  ): boolean {
    const parsed = parseConditionExpr(expr);
    if (!parsed.ok) {
      this.logger.warn('failed to parse artifact condition', {
        expr,
        error: parsed.message,
      });
      return false;
    }
    const ctx: EvaluatorContext = {
      meta: {},
      signals: {
        artifacts: [],
        reviewers_passed: [],
        confidence: 'medium',
        scope_changed: false,
      },
      artifact: frontmatter,
    };
    const ev = evaluateConditionExpr(parsed.ast, ctx);
    return ev.ok && ev.value === true;
  }

  /**
   * Apply a single invariant op to the frontmatter. Returns true if a
   * value actually changed (used to gate re-serialization).
   *
   * Dotted paths (e.g. `confidence.numeric`) are supported by walking
   * nested objects; missing intermediate segments are created as objects
   * for `set` and treated as missing-current-value for `cap`/`floor`.
   */
  private applyInvariant(
    frontmatter: Record<string, unknown>,
    inv: ArtifactInvariant,
  ): boolean {
    const segments = inv.enforce_field.split('.');
    if (segments.length === 0 || segments.some((s) => s.length === 0)) {
      this.logger.warn('invariant has malformed enforce_field', {
        field: inv.enforce_field,
      });
      return false;
    }
    return setOrClamp(frontmatter, segments, inv, this.logger);
  }
}

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

function hasFrontmatterMarker(content: string): boolean {
  return /^---\s*\r?\n/.test(content);
}

/**
 * Conditional paths may use a relative form (just the filename) or an
 * absolute path-within-the-task. We always treat them as relative to
 * `chat_NN/` (consistent with `spec.path`).
 */
function resolveConditionalPath(cp: ConditionalPath, _spec: ArtifactSpec): string {
  return cp.path;
}

/**
 * Apply cap/floor/set to a nested frontmatter path. Returns true on change.
 */
function setOrClamp(
  root: Record<string, unknown>,
  segments: readonly string[],
  inv: ArtifactInvariant,
  logger: WarnLogger,
): boolean {
  // Walk to the parent of the leaf, creating nested objects for `set`.
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = cursor[seg];
    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
      continue;
    }
    if (inv.op === 'set') {
      const fresh: Record<string, unknown> = {};
      cursor[seg] = fresh;
      cursor = fresh;
      continue;
    }
    // cap/floor with no existing parent object → nothing to clamp.
    return false;
  }
  const leaf = segments[segments.length - 1]!;
  const current = cursor[leaf];

  switch (inv.op) {
    case 'set': {
      if (current === inv.value) return false;
      cursor[leaf] = inv.value;
      return true;
    }
    case 'cap': {
      if (typeof inv.value !== 'number') {
        logger.warn('cap invariant requires numeric value', {
          field: inv.enforce_field,
          value: inv.value,
        });
        return false;
      }
      if (typeof current !== 'number') return false;
      if (current <= inv.value) return false;
      cursor[leaf] = inv.value;
      return true;
    }
    case 'floor': {
      if (typeof inv.value !== 'number') {
        logger.warn('floor invariant requires numeric value', {
          field: inv.enforce_field,
          value: inv.value,
        });
        return false;
      }
      if (typeof current !== 'number') return false;
      if (current >= inv.value) return false;
      cursor[leaf] = inv.value;
      return true;
    }
  }
}

/**
 * Re-emit the artifact with mutated frontmatter, preserving the body
 * verbatim. If the original had no frontmatter, prepend one.
 */
function rebuildWithFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  originalHasFrontmatter: boolean,
  originalContent: string,
): string {
  // Empty frontmatter object → keep original to avoid spurious diffs.
  if (Object.keys(frontmatter).length === 0) {
    return originalHasFrontmatter ? originalContent : body || originalContent;
  }
  const yamlText = yaml.dump(frontmatter, { lineWidth: -1, sortKeys: false }).trimEnd();
  const bodyText = body.startsWith('\n') ? body : `\n${body}`;
  return `---\n${yamlText}\n---${bodyText}`;
}
