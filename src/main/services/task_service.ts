// In-memory Task registry. Plan 5+ replaces with on-disk persistence at
// .sherpa/runtime/tasks/<id>/.
//
// Plan 8b Task 7 — `CreateTaskOptions` is now permissive: only `title` is
// truly required (typed as optional on the wire for back-compat). When the
// caller omits methodologyId / stageId, the task is created in "free chat"
// mode (methodology_selection_mode='none' is the default).
//
// Plan 8 Task 8 — optional SQLite persistence via ProjectDatabase.
// setDatabase() lazily injects the DB; all mutating methods call persist()
// after updating the in-memory Map. getTask() falls back to DB on cache miss.

import type {
  Task,
  TaskExecutionConfig,
  EffortLevel,
  ResponseMode,
  EconomyMode,
  MethodologySelectionMode,
  StrictnessMode,
} from '../../core/domain/task';
import { defaultTaskConfig } from '../../core/domain/task';
import type { AgentMessage } from '../../core/domain/agent';
import type { ProjectDatabase } from '../../core/adapters/project_database';

export interface CreateTaskOptions {
  /** Plan 8b Task 7 — human title. Required from the UI, optional on the wire. */
  readonly title?: string;
  /** Optional — set only when the user picked a methodology (manual mode). */
  readonly methodologyId?: string;
  /** Optional — only meaningful with methodologyId. */
  readonly stageId?: string;
  readonly methodology_selection_mode?: MethodologySelectionMode;
  readonly effort?: EffortLevel;
  readonly response_mode?: ResponseMode;
  readonly economy_mode?: EconomyMode;
  readonly config?: Partial<TaskExecutionConfig>;
  readonly compliance_review_enabled?: boolean;
  readonly projectPath?: string;
}

/**
 * Settings that can be applied AFTER task creation via the
 * TaskSettingsPanel "Apply" flow (first-send intercept). Only fields here
 * are mutable; other Task fields stay immutable post-create.
 */
export type ApplySettingsInput = Partial<
  Pick<
    Task,
    | 'title'
    | 'methodologyId'
    | 'stageId'
    | 'methodology_selection_mode'
    | 'effort'
    | 'response_mode'
    | 'economy_mode'
    | 'compliance_review_enabled'
    | 'strictness_mode'
    | 'ask_before_edit'
  >
>;

export class TaskService {
  private readonly tasks = new Map<string, Task>();
  private db: ReturnType<ProjectDatabase['raw']> | null = null;
  private sherpaN = 0;

  /**
   * Inject a ProjectDatabase after construction (called from IPC handler when
   * projectPath is known). Enables task persistence; subsequent mutations
   * auto-persist to <project>/.sherpa/sherpa.db.
   */
  setDatabase(projectDb: ProjectDatabase): void {
    this.db = projectDb.raw();
    // Seed counter from existing SHERPA-N rows so IDs never collide after restart.
    const row = this.db
      .prepare(`SELECT MAX(CAST(SUBSTR(id, 8) AS INTEGER)) AS max_n FROM tasks WHERE id LIKE 'SHERPA-%'`)
      .get() as { max_n: number | null } | undefined;
    this.sherpaN = row?.max_n ?? 0;
  }

  private persist(task: Task): void {
    if (!this.db) return;
    this.db.prepare(`
      INSERT OR REPLACE INTO tasks
        (id, title, project_path, status, methodology_id, methodology_selection_mode,
         effort, response_mode, economy_mode, strictness_mode,
         compliance_review_enabled, settings_locked,
         total_input_tokens, total_output_tokens, thread_json,
         tracker_stage_id, tracker_fields, tracker_session_summary,
         created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      task.id,
      task.title ?? '',
      task.projectPath ?? null,
      task.status,
      task.methodologyId ?? null,
      task.methodology_selection_mode ?? 'none',
      task.effort ?? 'normal',
      task.response_mode ?? 'detailed',
      task.economy_mode ?? 'unlimited',
      task.strictness_mode ?? 'standard',
      task.compliance_review_enabled ? 1 : 0,
      task.settings_locked ? 1 : 0,
      task.totalTokens.input,
      task.totalTokens.output,
      JSON.stringify(task.thread),
      task.tracker_stage_id ?? null,
      JSON.stringify(task.tracker_fields ?? {}),
      task.tracker_session_summary ?? null,
      task.createdAt,
      task.updatedAt,
    );
  }

  private rowToTask(row: unknown): Task {
    const r = row as Record<string, unknown>;
    return {
      id: r['id'] as string,
      title: (r['title'] as string) || undefined,
      projectPath: (r['project_path'] as string | null) ?? undefined,
      status: r['status'] as Task['status'],
      methodologyId: (r['methodology_id'] as string | null) ?? undefined,
      methodology_selection_mode: r['methodology_selection_mode'] as Task['methodology_selection_mode'],
      effort: r['effort'] as Task['effort'],
      response_mode: r['response_mode'] as Task['response_mode'],
      economy_mode: r['economy_mode'] as Task['economy_mode'],
      strictness_mode: r['strictness_mode'] as Task['strictness_mode'],
      compliance_review_enabled: (r['compliance_review_enabled'] as number) === 1,
      settings_locked: (r['settings_locked'] as number) === 1,
      totalTokens: {
        input: r['total_input_tokens'] as number,
        output: r['total_output_tokens'] as number,
      },
      thread: JSON.parse(r['thread_json'] as string) as AgentMessage[],
      // config is not persisted — use defaults on reload
      config: defaultTaskConfig(),
      createdAt: r['created_at'] as string,
      updatedAt: r['updated_at'] as string,
      tracker_stage_id: (r['tracker_stage_id'] as string | null) ?? undefined,
      tracker_fields: (() => {
        const raw = r['tracker_fields'] as string | null;
        if (!raw) return undefined;
        try { return JSON.parse(raw) as Record<string, unknown>; } catch { return undefined; }
      })(),
      tracker_session_summary: (r['tracker_session_summary'] as string | null) ?? undefined,
    };
  }

  createTask(opts: CreateTaskOptions): Task {
    const now = new Date().toISOString();
    const selectionMode: MethodologySelectionMode =
      opts.methodology_selection_mode ??
      // If caller supplied a methodologyId without explicit mode, default
      // to 'manual' so the supervisor will bootstrap the engine. Otherwise
      // 'none' = free chat (no bootstrap).
      (opts.methodologyId ? 'manual' : 'none');
    const task: Task = {
      id: `SHERPA-${++this.sherpaN}`,
      title: opts.title,
      projectPath: opts.projectPath,
      methodologyId: opts.methodologyId,
      stageId: opts.stageId,
      methodology_selection_mode: selectionMode,
      effort: opts.effort ?? 'normal',
      response_mode: opts.response_mode ?? 'detailed',
      economy_mode: opts.economy_mode ?? 'unlimited',
      status: 'created',
      thread: [],
      config: { ...defaultTaskConfig(), ...opts.config },
      createdAt: now,
      updatedAt: now,
      totalTokens: { input: 0, output: 0 },
      strictness_mode: 'standard',
      compliance_review_enabled: opts.compliance_review_enabled ?? false,
      settings_locked: false,
    };
    this.tasks.set(task.id, task);
    this.persist(task);
    return task;
  }

  getTask(id: string): Task | null {
    let task = this.tasks.get(id);
    if (!task && this.db) {
      const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (row) {
        task = this.rowToTask(row);
        this.tasks.set(id, task);
      }
    }
    return task ?? null;
  }

  appendMessages(id: string, msgs: readonly AgentMessage[]): Task | null {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const next: Task = {
      ...existing,
      thread: [...existing.thread, ...msgs],
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, next);
    this.persist(next);
    return next;
  }

  recordTurn(
    id: string,
    tokens: { input: number; output: number } | null,
  ): Task | null {
    const t = this.tasks.get(id);
    if (!t) return null;
    const updated: Task = {
      ...t,
      totalTokens: {
        input: t.totalTokens.input + (tokens?.input ?? 0),
        output: t.totalTokens.output + (tokens?.output ?? 0),
      },
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, updated);
    this.persist(updated);
    return updated;
  }

  listTasks(projectPath?: string): readonly Task[] {
    if (this.db) {
      // Merge: in-memory tasks take precedence (they are more up-to-date).
      const dbRows = projectPath
        ? this.db.prepare('SELECT * FROM tasks WHERE project_path = ? ORDER BY created_at DESC').all(projectPath)
        : this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
      const result = new Map<string, Task>();
      for (const row of dbRows) {
        const t = this.rowToTask(row);
        result.set(t.id, t);
      }
      // In-memory overrides DB (in-memory is more recent).
      for (const [id, t] of this.tasks) {
        if (!projectPath || t.projectPath === projectPath) result.set(id, t);
      }
      return [...result.values()];
    }
    const all = [...this.tasks.values()];
    return projectPath ? all.filter((t) => t.projectPath === projectPath) : all;
  }

  deleteTask(id: string): void {
    this.tasks.delete(id);
    if (this.db) {
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    }
  }

  /**
   * Plan 8b Task 7 — applies settings selected in TaskSettingsPanel just
   * before the first user message is sent. Caller is expected to follow
   * up with `lockSettings(id)` so the panel collapses to its chip strip.
   *
   * Returns null when the task id is unknown. Does not mutate
   * `settings_locked` itself.
   */
  applySettings(id: string, settings: ApplySettingsInput): Task | null {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    // Recompute strictness explicitly so it can be cleared by passing null
    // (treat undefined as "leave it alone"). Same for the other fields.
    const next: Task = {
      ...existing,
      ...(settings.title !== undefined && { title: settings.title }),
      ...(settings.methodologyId !== undefined && { methodologyId: settings.methodologyId }),
      ...(settings.stageId !== undefined && { stageId: settings.stageId }),
      ...(settings.methodology_selection_mode !== undefined && {
        methodology_selection_mode: settings.methodology_selection_mode,
      }),
      ...(settings.effort !== undefined && { effort: settings.effort }),
      ...(settings.response_mode !== undefined && { response_mode: settings.response_mode }),
      ...(settings.economy_mode !== undefined && { economy_mode: settings.economy_mode }),
      ...(settings.compliance_review_enabled !== undefined && {
        compliance_review_enabled: settings.compliance_review_enabled,
      }),
      ...(settings.strictness_mode !== undefined && { strictness_mode: settings.strictness_mode }),
      ...(settings.ask_before_edit !== undefined && { ask_before_edit: settings.ask_before_edit }),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, next);
    this.persist(next);
    return next;
  }

  /** Marks the task's settings as locked (panel collapses to chip strip). */
  lockSettings(id: string): Task | null {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const next: Task = {
      ...existing,
      settings_locked: true,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, next);
    this.persist(next);
    return next;
  }
}

// Re-export the StrictnessMode type alias so callers that import from this
// module don't need a second import path. (Imported above so it's in scope.)
export type { StrictnessMode };
