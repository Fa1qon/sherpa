// src/main/services/meta_md_store.ts
// Plan 8 Task 15 — concrete MetaMdStore.
//
// Persists a task's TaskMeta projection to `<project>/.sherpa/tasks/<id>/meta.md`
// as a YAML frontmatter document. The body of the markdown is a tiny
// human-readable summary (stage history table) so a developer poking at
// the file on disk can still tell what's going on without parsing YAML.
//
// All writes are atomic: payload lands in `<path>.tmp.<pid>.<ts>.<rand>`,
// fsync'd, then renamed over the target. We reuse the project-wide
// `atomicWrite` helper so error-translation (ENOSPC, EBUSY, EACCES)
// matches every other writer in the codebase.
//
// Mutator methods perform read-modify-write — the caller's life is too
// short to manage a cursor. Concurrency: a single MethodologyRunner owns
// one task; there is no expected contention. If two runners ever race on
// the same task, last-writer-wins on the frontmatter document, which is
// the same guarantee atomicWrite gives every other store.
//
// Strict TS; no IPC; depends on already-present deps (`gray-matter`,
// `js-yaml`) plus Node built-ins.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';

import { atomicWrite } from '../../core/infrastructure/atomic_write';
import {
  createDefaultTaskMeta,
  type TaskMeta,
  type TaskMetaStageHistoryEntry,
  type TaskMetaStatus,
} from '../../core/domain/task_meta';
import type { CounterMutations } from '../../core/domain/task_meta';
import type { MetaMdStore } from './gate_evaluator';

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function metaPathFor(projectPath: string, taskId: string): string {
  return path.join(projectPath, '.sherpa', 'tasks', taskId, 'meta.md');
}

function bodyFor(meta: TaskMeta): string {
  const lines: string[] = [];
  lines.push('# Task meta');
  lines.push('');
  lines.push(`Status: **${meta.status ?? 'active'}**`);
  if (meta.current_stage) lines.push(`Current stage: \`${meta.current_stage}\``);
  lines.push('');
  if (meta.stage_history && meta.stage_history.length > 0) {
    lines.push('## Stage history');
    lines.push('');
    for (const h of meta.stage_history) {
      const tail = h.rollback_from
        ? ` (rollback from \`${h.rollback_from}\`)`
        : '';
      const closed = h.completed_at ? ` → ${h.completed_at}` : '';
      lines.push(`- \`${h.stage_id}\` ${h.entered_at}${closed}${tail}`);
    }
  }
  return lines.join('\n') + '\n';
}

function serializeMeta(meta: TaskMeta): string {
  // Build a plain object with only defined fields so the YAML stays tidy.
  const front: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    front[k] = v;
  }
  const yamlText = yaml.dump(front, { lineWidth: -1, sortKeys: false }).trimEnd();
  return `---\n${yamlText}\n---\n${bodyFor(meta)}`;
}

function parseMeta(raw: string): TaskMeta {
  // gray-matter handles missing frontmatter gracefully (returns data={}).
  const parsed = matter(raw);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  // Trust the YAML: if a user hand-edited a bogus field, the engine simply
  // ignores it (no strict schema enforcement at this layer).
  return data as TaskMeta;
}

// ---------------------------------------------------------------------------
// MetaMdStoreImpl
// ---------------------------------------------------------------------------

export interface MetaMdStoreOptions {
  /** Clock override for tests (returns ISO 8601 strings). Default: Date.now(). */
  readonly clock?: () => string;
  /**
   * Skip fsync inside atomicWrite — speeds up the test suite on slow disks.
   * Default: false (fsync on). Pass `true` from tests to avoid disk stalls.
   */
  readonly noFsync?: boolean;
}

export class MetaMdStoreImpl implements MetaMdStore {
  private readonly clock: () => string;
  private readonly noFsync: boolean;

  constructor(opts: MetaMdStoreOptions = {}) {
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.noFsync = opts.noFsync ?? false;
  }

  /**
   * Read `meta.md` for the given task. Returns a fresh default
   * `TaskMeta` if the file is missing OR malformed (the engine never
   * stops because the user trashed their meta).
   *
   * Does NOT persist the default — call a mutator (or `save`) to write.
   */
  async load(projectPath: string, taskId: string): Promise<TaskMeta> {
    const file = metaPathFor(projectPath, taskId);
    let raw: string;
    try {
      raw = await fsp.readFile(file, 'utf8');
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        return createDefaultTaskMeta({
          task_id: taskId,
          started_at: this.clock(),
        });
      }
      // Permission / IO — degrade to defaults rather than crash the runner.
      // The engine will overwrite on the next mutator call.
      return createDefaultTaskMeta({
        task_id: taskId,
        started_at: this.clock(),
      });
    }
    try {
      const parsed = parseMeta(raw);
      // Ensure task_id is set even if the user hand-wrote an incomplete file.
      return parsed.task_id ? parsed : { ...parsed, task_id: taskId };
    } catch {
      return createDefaultTaskMeta({
        task_id: taskId,
        started_at: this.clock(),
      });
    }
  }

  /**
   * Persist a complete TaskMeta projection. Atomic (tmp + rename).
   * Ensures the parent directory exists.
   */
  async save(projectPath: string, taskId: string, meta: TaskMeta): Promise<void> {
    const file = metaPathFor(projectPath, taskId);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const text = serializeMeta(meta);
    await atomicWrite(file, text, { fsync: !this.noFsync });
  }

  async markStageCompleted(
    projectPath: string,
    taskId: string,
    stageId: string,
  ): Promise<void> {
    const meta = await this.load(projectPath, taskId);
    const history = meta.stage_history ?? [];
    // Try to close the most recent entry for this stage; if none exists,
    // append a synthetic one (the caller never called setCurrentStage).
    let updated: TaskMetaStageHistoryEntry[];
    let closed = false;
    updated = history.map((h) => {
      if (!closed && h.stage_id === stageId && !h.completed_at) {
        closed = true;
        return { ...h, completed_at: this.clock() };
      }
      return h;
    });
    if (!closed) {
      const now = this.clock();
      updated = [
        ...updated,
        { stage_id: stageId, entered_at: now, completed_at: now },
      ];
    }
    await this.save(projectPath, taskId, {
      ...meta,
      stage_history: updated,
    });
  }

  async recordRollback(
    projectPath: string,
    taskId: string,
    fromStage: string,
    toStage: string,
  ): Promise<void> {
    const meta = await this.load(projectPath, taskId);
    const history = meta.stage_history ?? [];
    const entry: TaskMetaStageHistoryEntry = {
      stage_id: toStage,
      entered_at: this.clock(),
      rollback_from: fromStage,
    };
    await this.save(projectPath, taskId, {
      ...meta,
      stage_history: [...history, entry],
      current_stage: toStage,
    });
  }

  async applyCounterMutations(
    projectPath: string,
    taskId: string,
    mutations: CounterMutations,
  ): Promise<void> {
    const meta = await this.load(projectPath, taskId);
    const counters: Record<string, number | boolean> = { ...(meta.counters ?? {}) };
    for (const name of mutations.incremented) {
      const prev = counters[name];
      if (typeof prev === 'number') {
        counters[name] = prev + 1;
      } else if (typeof prev === 'boolean') {
        // Booleans are tracked as flags — incrementing flips them on.
        counters[name] = true;
      } else {
        counters[name] = 1;
      }
    }
    // `preserved` is informational at this layer: rollback-reset semantics
    // live in the runner; the store does not erase counters on its own.
    await this.save(projectPath, taskId, { ...meta, counters });
  }

  async setCurrentStage(
    projectPath: string,
    taskId: string,
    stageId: string,
  ): Promise<void> {
    const meta = await this.load(projectPath, taskId);
    const history = meta.stage_history ?? [];
    // Only append a new entry if the cursor is actually moving and the
    // last entry is for a different stage (or the previous entry is
    // already closed) — otherwise we'd record entries every save.
    const last = history[history.length - 1];
    let updated = history;
    if (!last || last.stage_id !== stageId) {
      updated = [...history, { stage_id: stageId, entered_at: this.clock() }];
    }
    await this.save(projectPath, taskId, {
      ...meta,
      current_stage: stageId,
      stage_history: updated,
    });
  }

  /** Convenience — flip status (e.g. resume from paused). */
  async setStatus(
    projectPath: string,
    taskId: string,
    status: TaskMetaStatus,
  ): Promise<void> {
    const meta = await this.load(projectPath, taskId);
    const next: TaskMeta = { ...meta, status };
    if (status === 'completed' || status === 'failed') {
      (next as { completed_at?: string }).completed_at =
        meta.completed_at ?? this.clock();
    }
    await this.save(projectPath, taskId, next);
  }

  markPaused(projectPath: string, taskId: string): Promise<void> {
    return this.setStatus(projectPath, taskId, 'paused');
  }

  markCompleted(projectPath: string, taskId: string): Promise<void> {
    return this.setStatus(projectPath, taskId, 'completed');
  }

  async markFailed(
    projectPath: string,
    taskId: string,
    _reason: string,
  ): Promise<void> {
    await this.setStatus(projectPath, taskId, 'failed');
  }
}
