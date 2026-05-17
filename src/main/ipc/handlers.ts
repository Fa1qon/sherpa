// src/main/ipc/handlers.ts
import { BrowserWindow } from 'electron';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Container } from '../container';
import { PORT } from '../composition_root';
import { CH } from './channels';
import type { AddProjectOptions } from '../../core/ports/project_port';
import type { UserSettings, ProjectSettings } from '../../core/domain/settings';
import type {
  TaskEventPayload,
  EffortLevel,
  ResponseMode,
  EconomyMode,
  MethodologySelectionMode,
} from '../../core/domain/task';
import { EFFORT_TO_MODEL, BUDGET_MODE_USD_CAP } from '../../core/domain/task';
import { INVOLVEMENT_PRESETS } from '../../core/domain/involvement';
import type { ApplySettingsInput } from '../services/task_service';
import { readTrace } from '../services/trace_logger';
import { ComplianceReviewer } from '../services/compliance_reviewer';
import { MetaMdStoreImpl } from '../services/meta_md_store';
import { SherpaMcpServer } from '../services/sherpa_mcp_server';
import { findFirstStageId, findNextStageId } from '../../core/methodology/next_stage';
import type {
  TaskSupervisor,
  TaskEventEmitter,
} from '../services/task_supervisor';
import { ProjectDatabase } from '../../core/adapters/project_database';
import { CaseService } from '../services/case_service';
import type { CreateCaseInput } from '../../core/domain/case';
import { KnowledgeService } from '../services/knowledge_service';
import type { CreateKnowledgeInput } from '../../core/domain/knowledge';
import { TemplateService } from '../services/template_service';
import type { CreateTemplateInput } from '../../core/domain/artifact_template';
import { eventBus } from '../events/event_bus';
import { SessionStore } from '../services/session_store';
import type { SessionData } from '../services/session_store';
import { initDebugErrorCapture, registerDebugHandlers } from './debug_handlers';

/** Optional low-level overrides for testability. */
export interface IpcHandlerDeps {
  /** Override clipboard.writeText — defaults to electron clipboard. */
  readonly clipboardWrite?: (text: string) => void;
}

/**
 * Per-task Claude Code session ID for free-chat turns.
 * Keyed by task ID; value is the `session_id` returned by Claude Code in
 * the `result` event. Passed as `--resume <id>` on the next turn so the
 * agent retains conversation history across multiple user messages.
 * Module-scoped (process lifetime) — cleared implicitly on app restart.
 */
const freeChatSessionIds = new Map<string, string>();

/**
 * Tracks the last Claude Code session ID returned for methodology tasks,
 * keyed by taskId. Passed as `resumeSessionId` on the next turn so the
 * agent sees its prior conversation history within the same stage.
 * Reset when stage advances (different stages start fresh sessions).
 */
const methodologySessionIds = new Map<string, string>();

/** Module-level MCP server — started lazily on first methodology turn. */
const sherpaMcpServer = new SherpaMcpServer();
let mcpStarting: Promise<void> | null = null;

async function ensureMcpServer(): Promise<void> {
  if (!mcpStarting) mcpStarting = sherpaMcpServer.start();
  await mcpStarting;
}

const PERM_MODE_MAP: Readonly<Record<string, 'bypassPermissions' | 'acceptEdits' | 'auto'>> = {
  bypass: 'bypassPermissions',
  acceptEdits: 'acceptEdits',
  auto: 'auto',
};

function resolvePermMode(
  projMode: string | undefined,
  askBeforeEdit: boolean | undefined,
): 'bypassPermissions' | 'acceptEdits' | 'auto' {
  const base = PERM_MODE_MAP[projMode ?? 'bypass'] ?? 'bypassPermissions';
  return askBeforeEdit === true ? 'acceptEdits' : base;
}

/**
 * Wire all IPC channels to their backing services.
 *
 * In production, `ipcMain` is the real electron import. Tests inject a fake.
 * The fake must implement `handle(channel, listener)` and `invoke(channel, ...args)`.
 */
export function registerIpcHandlers(
  container: Container,
  ipcMainOverride?: Pick<IpcMain, 'handle'>,
  deps: IpcHandlerDeps = {},
): void {
  initDebugErrorCapture();

  // Lazy require so this module loads in vitest (where electron is unavailable).
  const ipcMain: Pick<IpcMain, 'handle'> =
    ipcMainOverride ??
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('electron') as { ipcMain: IpcMain }).ipcMain;

  const clipboardWrite: (text: string) => void =
    deps.clipboardWrite ??
    ((text: string): void => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { clipboard } = require('electron') as { clipboard: { writeText(s: string): void } };
        clipboard.writeText(text);
      } catch { /* clipboard unavailable */ }
    });

  const project = container.resolve(PORT.project);
  const settings = container.resolve(PORT.settings);

  // Wire BrowserService into the module-level MCP server so per-turn
  // browser tools can look up sessions by taskId.
  try {
    const browserSvc = container.resolve(PORT.browserService);
    sherpaMcpServer.setBrowserService(browserSvc);
  } catch { /* BrowserService unavailable in test environment */ }

  const sessionStore = new SessionStore();

  // Resolved early so PROJECT_OPEN / PROJECT_ADD can initialise the DB.
  // (Also referenced in the task.* section below — no duplicate resolve.)
  const taskService = container.resolve(PORT.task);

  // --- session.* ----------------------------------------------------------
  ipcMain.handle(CH.SESSION_GET, (_e, projectPath: string) =>
    sessionStore.getSession(projectPath),
  );

  ipcMain.handle(CH.SESSION_SET, (_e, projectPath: string, data: SessionData) =>
    sessionStore.setSession(projectPath, data),
  );

  // --- project.* ---------------------------------------------------------
  ipcMain.handle(CH.PROJECT_LIST_RECENT, () => project.listRecent());

  ipcMain.handle(CH.PROJECT_ADD, async (_event, opts: AddProjectOptions) => {
    const result = await project.addProject(opts);
    if (result.ok) {
      try {
        taskService.setDatabase(new ProjectDatabase(result.project.path));
      } catch { /* best-effort */ }
      try {
        const win = BrowserWindow.getFocusedWindow?.() ?? BrowserWindow.getAllWindows?.()[0] ?? null;
        if (win) {
          const projectName = path.basename(result.project.path);
          win.setTitle(`${projectName} — Sherpa`);
        }
      } catch { /* best-effort — unavailable in test env */ }
    }
    return result;
  });

  ipcMain.handle(CH.PROJECT_OPEN, async (_event, id: string) => {
    const opened = await project.open(id);
    if (opened) {
      try {
        taskService.setDatabase(new ProjectDatabase(opened.path));
      } catch { /* best-effort */ }
      try {
        const win = BrowserWindow.getFocusedWindow?.() ?? BrowserWindow.getAllWindows?.()[0] ?? null;
        if (win) {
          const projectName = path.basename(opened.path);
          win.setTitle(`${projectName} — Sherpa`);
        }
      } catch { /* best-effort — unavailable in test env */ }
    }
    return opened;
  });

  ipcMain.handle(CH.PROJECT_REMOVE_FROM_RECENT, async (_event, id: string) => {
    const result = await project.removeFromRecent(id);
    try {
      const win = BrowserWindow.getFocusedWindow?.() ?? BrowserWindow.getAllWindows?.()[0] ?? null;
      if (win) win.setTitle('Sherpa');
    } catch { /* best-effort — unavailable in test env */ }
    return result;
  });

  ipcMain.handle(CH.PROJECT_PICK_FOLDER, async () => {
    // Folder picker via electron dialog — only available when running under
    // Electron, not during vitest. Tests should never invoke this channel.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // --- settings.* --------------------------------------------------------
  ipcMain.handle(CH.SETTINGS_GET_USER, () => settings.getUserSettings());

  ipcMain.handle(CH.SETTINGS_SET_USER, (_event, s: UserSettings) =>
    settings.setUserSettings(s),
  );

  ipcMain.handle(CH.SETTINGS_GET_PROJECT, (_event, projectPath: string) =>
    settings.getProjectSettings(projectPath),
  );

  ipcMain.handle(
    CH.SETTINGS_SET_PROJECT,
    (_event, projectPath: string, s: ProjectSettings) =>
      settings.setProjectSettings(projectPath, s),
  );

  // --- methodology.* -----------------------------------------------------
  const methodology = container.resolve(PORT.methodology);

  ipcMain.handle(CH.METHODOLOGY_LIST, (_event, projectPath: string) =>
    methodology.list(projectPath),
  );
  ipcMain.handle(CH.METHODOLOGY_LOAD, (_event, projectPath: string, id: string) =>
    methodology.load(projectPath, id),
  );
  ipcMain.handle(CH.METHODOLOGY_SAVE, (_event, projectPath: string, m: unknown) =>
    methodology.save(projectPath, m as never),
  );

  // --- shell.* -----------------------------------------------------------
  ipcMain.handle(CH.SHELL_OPEN_PATH, async (_event, p: string) => {
    if (typeof p !== 'string' || p.length === 0) return 'invalid-path';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { shell } = require('electron');
    return shell.openPath(p);   // returns error string or '' on success
  });

  ipcMain.handle(CH.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url !== 'string' || url.length === 0) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { shell } = require('electron');
    await shell.openExternal(url);
  });

  // --- task.* -----------------------------------------------------------
  // taskService is resolved above (before project.* handlers) — no duplicate.
  const masterChat = container.resolve(PORT.masterChat);

  // Plan 8-fix Task 1 — supervisor + engine event emitter are optional in
  // tests (legacy IPC tests register a partial container without them).
  // Resolve defensively; absent supervisor → engine-bootstrap is skipped
  // and TASK_PAUSE/TASK_RESUME/TASK_CANCEL fall back to meta-only writes.
  let supervisor: TaskSupervisor | undefined;
  let taskEvents: TaskEventEmitter | undefined;
  try {
    supervisor = container.resolve(PORT.taskSupervisor) as TaskSupervisor;
  } catch {
    supervisor = undefined;
  }
  try {
    taskEvents = container.resolve(PORT.taskEvents);
  } catch {
    taskEvents = undefined;
  }

  // Forward engine events to all renderer windows. BrowserWindow only
  // exists under Electron — try/catch keeps tests (which don't load the
  // electron module) clean.
  if (taskEvents) {
    taskEvents.on((taskId, e) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BrowserWindow } = require('electron') as {
          BrowserWindow: { getAllWindows(): { webContents: { send: (ch: string, payload: unknown) => void } }[] };
        };
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(CH.TASK_EVENT, {
            taskId,
            kind: 'engine_event',
            event: e,
          });
        }
      } catch {
        // electron not loaded (tests); subscribers consume directly.
      }
    });
  }

  async function loadStageInputArtifacts(
    stage: import('../../core/domain/methodology').Stage,
    projectPath: string,
  ): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();
    for (const ref of stage.contract.input ?? []) {
      const abs = path.isAbsolute(ref.artifact)
        ? ref.artifact
        : path.join(projectPath, ref.artifact);
      try {
        result.set(ref.artifact, await fsp.readFile(abs, 'utf8'));
      } catch { /* missing input tolerated */ }
    }
    return result;
  }

  ipcMain.handle(
    CH.TASK_CREATE,
    async (
      _event,
      opts: {
        // Plan 8b Task 7 — title is the only field NewTaskDialog requires
        // from the user. All other settings are optional and configured
        // via TaskSettingsPanel before the first message is sent.
        title?: string;
        methodologyId?: string;
        stageId?: string;
        methodology_selection_mode?: MethodologySelectionMode;
        effort?: EffortLevel;
        response_mode?: ResponseMode;
        economy_mode?: EconomyMode;
        projectPath?: string;
        autoStart?: boolean;
        compliance_review_enabled?: boolean;
      },
    ) => {
      // Lazy-inject ProjectDatabase into TaskService when projectPath is known.
      // This enables task persistence; subsequent mutations auto-persist.
      if (typeof opts.projectPath === 'string' && opts.projectPath.length > 0) {
        try {
          const projDb = new ProjectDatabase(opts.projectPath);
          taskService.setDatabase(projDb);
        } catch {
          // Best-effort — task creation still succeeds without DB
        }
      }
      const task = taskService.createTask(opts);
      // Auto-start when projectPath is supplied (and not explicitly
      // suppressed). The supervisor itself decides whether to bootstrap
      // the engine (manual mode) or emit a `free_chat_session_opened`
      // marker (none/router modes — Plan 8b Task 7).
      const shouldAutoStart =
        supervisor !== undefined &&
        typeof opts.projectPath === 'string' &&
        opts.projectPath.length > 0 &&
        opts.autoStart !== false;
      if (shouldAutoStart && supervisor && opts.projectPath) {
        try {
          await supervisor.start(task, opts.projectPath);
        } catch {
          // Already-emitted via taskEvents inside supervisor.start; the
          // task object is still returned to the renderer.
        }
      }
      return task;
    },
  );

  // Plan 8b Task 7 — TaskSettingsPanel apply/lock.
  // Caller pattern (renderer): on first send, the workspace invokes
  //   applySettings(taskId, settings) → lockSettings(taskId) → startTurn(...)
  // so the engine sees the user-selected methodology/strictness/etc.
  ipcMain.handle(
    CH.TASK_APPLY_SETTINGS,
    (_event, id: string, settings: ApplySettingsInput) => {
      return taskService.applySettings(id, settings);
    },
  );
  ipcMain.handle(CH.TASK_LOCK_SETTINGS, (_event, id: string) => {
    return taskService.lockSettings(id);
  });

  ipcMain.handle(CH.TASK_GET, (_event, id: string) => taskService.getTask(id));

  ipcMain.handle(CH.TASK_LIST, (_event, projectPath?: string) => taskService.listTasks(projectPath));

  ipcMain.handle(CH.TASK_DELETE, (_event, id: string) => { taskService.deleteTask(id); });

  // Helper: send a task event safely (no-op if sender not available, e.g. in tests).
  const sendTaskEvent = (event: unknown, payload: TaskEventPayload): void => {
    const sender = (event as Partial<IpcMainInvokeEvent>).sender;
    if (sender && typeof sender.send === 'function') {
      sender.send(CH.TASK_EVENT, payload);
    }
  };

  ipcMain.handle(
    CH.TASK_START_TURN,
    async (
      event,
      args: { taskId: string; projectPath: string; userMessage: string },
    ) => {
      let task = taskService.getTask(args.taskId);
      if (!task) {
        return { ok: false as const, error: 'task-not-found' as const };
      }

      // --- Stage initialisation for methodology tasks -----------------------
      // On the FIRST message of a methodology task, stageId is not yet set.
      // Walk the 'start' edge to find the first real stage and persist it so
      // subsequent messages reach the methodology path.
      if (
        task.methodology_selection_mode === 'manual' &&
        task.methodologyId &&
        !task.stageId
      ) {
        try {
          const loadedInit = await methodology.load(args.projectPath, task.methodologyId);
          if (loadedInit.ok) {
            const firstId = findFirstStageId(loadedInit.methodology);
            if (firstId !== 'end') {
              const updated = taskService.applySettings(args.taskId, { stageId: firstId });
              if (updated) task = updated;
            }
          }
        } catch { /* best-effort: continue without stageId → free-chat */ }
      }

      const nowIso = (): string => new Date().toISOString();
      const userMsg = {
        id: `u-${Date.now()}`,
        role: 'user' as const,
        text: args.userMessage,
        timestamp: nowIso(),
      };

      // Plan 8b Task 7 — Free chat mode: no methodology, no stage, no engine.
      // We open a worker AgentSession directly via the agent port and forward
      // its streamed messages back through the same TASK_EVENT pipeline.
      // Router mode is a placeholder until Plan 12 and falls through to the
      // free-chat path with no methodology context.
      const selectionMode = task.methodology_selection_mode ?? 'none';
      const isFreeChat =
        selectionMode === 'none' ||
        selectionMode === 'router' ||
        !task.methodologyId ||
        !task.stageId ||
        task.stageId === 'end';

      if (task.stageId === 'end' && task.methodologyId) {
        eventBus.emit('task.methodology.completed', {
          taskId: args.taskId,
          ts: new Date().toISOString(),
        });
      }

      if (isFreeChat) {
        let agentPort;
        try {
          agentPort = container.resolve(PORT.agent);
        } catch {
          return { ok: false as const, error: 'agent-port-unavailable' as const };
        }

        taskService.appendMessages(args.taskId, [userMsg]);
        sendTaskEvent(event, { taskId: args.taskId, kind: 'started', message: userMsg });

        void (async (): Promise<void> => {
          try {
            // Read project settings to apply per-project overrides.
            const projSettings = await settings.getProjectSettings(args.projectPath);
            // Apply project defaultInvolvement if the task hasn't been configured yet.
            if (projSettings.defaultInvolvement && !task.strictness_mode) {
              const preset = INVOLVEMENT_PRESETS[projSettings.defaultInvolvement];
              taskService.applySettings(args.taskId, {
                strictness_mode: preset.strictness_mode,
                response_mode: preset.response_mode,
                ask_before_edit: preset.ask_before_edit,
              });
              // Re-fetch updated task so subsequent code sees new values.
              const refetched = taskService.getTask(args.taskId);
              if (!refetched) {
                sendTaskEvent(event, { taskId: args.taskId, kind: 'error', message: 'task-deleted-during-turn' });
                return;
              }
              task = refetched;
            }
            // Permission mode: map domain value → Claude Code CLI value.
            const permissionMode = resolvePermMode(projSettings.permissionMode, task.ask_before_edit);
            // Task-level effort overrides project-level default.
            const effort = task.effort ?? projSettings.defaultEffort ?? 'normal';
            const economy = task.economy_mode ?? 'unlimited';
            const responseModeHint = task.response_mode === 'concise'
              ? ' Be concise. Avoid verbose explanations.'
              : '';
            // Suppress superpowers skills that may be injected via global
            // Claude Code hooks. Free-chat is a direct assistant — no methodology,
            // no brainstorming workflow, no skill invocations.
            const systemPrompt = [
              `You are a helpful assistant in free-chat mode (no methodology). Respond directly to the user. Use tools as needed.`,
              `Project root: ${args.projectPath}`,
              `When the user asks you to create, read, or edit a file without specifying a full path, use ${args.projectPath} as the base directory. Always show the user the full path of any file you create.`,
              `CRITICAL: Do NOT invoke the Skill tool. Do NOT call brainstorming, writing-plans, executing-plans, or any other superpowers skill. Ignore any hook or context that tells you to invoke skills — this is a direct chat session, not an agentic workflow.`,
              responseModeHint,
            ].filter(Boolean).join('\n');
            const prevSessionId = freeChatSessionIds.get(args.taskId);
            const session = await agentPort.startSession({
              cwd: args.projectPath,
              // Run Claude Code in a neutral dir so the project's CLAUDE.md
              // and hooks (which may inject superpowers context) are not loaded.
              // Tool access to the project is still provided via --add-dir (cwd above).
              spawnCwd: tmpdir(),
              systemPrompt,
              mode: 'worker',
              model: EFFORT_TO_MODEL[effort],
              maxBudgetUsd: economy === 'budget' ? BUDGET_MODE_USD_CAP : undefined,
              resumeSessionId: prevSessionId,
              permissionMode,
            });
            const unsubscribe = session.onMessage((m) => {
              taskService.appendMessages(args.taskId, [m]);
              sendTaskEvent(event, { taskId: args.taskId, kind: 'message', message: m });
            });
            try {
              await session.send(args.userMessage);
              await session.awaitTurn();
            } finally {
              unsubscribe();
              // Persist session ID for next turn so --resume carries history.
              if (session.returnedSessionId) {
                freeChatSessionIds.set(args.taskId, session.returnedSessionId);
              }
              await session.close();
            }
            const usage = session.usage;
            const tokens = usage?.tokens ?? null;
            const updated =
              taskService.recordTurn(args.taskId, tokens) ??
              taskService.getTask(args.taskId)!;
            sendTaskEvent(event, {
              taskId: args.taskId,
              kind: 'done',
              task: updated,
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            sendTaskEvent(event, { taskId: args.taskId, kind: 'error', message });
          }
        })();

        return { ok: true as const };
      }

      const loaded = await methodology.load(args.projectPath, task.methodologyId as string);
      if (!loaded.ok) {
        return {
          ok: false as const,
          error: `methodology-load-failed: ${loaded.error.kind}`,
        };
      }
      const stage = loaded.methodology.stages.find((s) => s.id === task!.stageId);
      if (!stage) {
        return { ok: false as const, error: 'stage-not-found' as const };
      }

      // Load input artifacts for the current stage.
      const inputArtifacts = await loadStageInputArtifacts(stage, args.projectPath);

      // Append user message immediately and fire 'started' event.
      taskService.appendMessages(args.taskId, [userMsg]);
      sendTaskEvent(event, { taskId: args.taskId, kind: 'started', message: userMsg });

      // Capture task snapshot for the turn (stageId may advance after).
      const taskSnapshot = task;

      // Compute permissionMode for methodology path.
      const methodologyProjSettings = await settings.getProjectSettings(args.projectPath);
      const methPermissionMode = resolvePermMode(methodologyProjSettings?.permissionMode, taskSnapshot.ask_before_edit);

      // Ensure MCP server is running and register a per-turn session.
      await ensureMcpServer();
      const mcpSessionToken = randomUUID();
      let stageAdvanced = false;
      let advancedToStageId: string | undefined;

      // Auto-continue: fires the next stage's turn automatically after a stage
      // advance, eliminating the need for the user to type "продолжай".
      // Captures handler-scope references (masterChat, taskService, etc.).
      const runAutoTurn = async (toStageId: string): Promise<void> => {
        const nextStage = loaded.methodology.stages.find((s) => s.id === toStageId);
        if (!nextStage) return;
        const nextTask = taskService.getTask(args.taskId);
        if (!nextTask) return;

        // Brief pause so the UI renders the "stage entered" event before new output.
        await new Promise<void>((r) => setTimeout(r, 400));

        const nextInputArtifacts = await loadStageInputArtifacts(nextStage, args.projectPath);
        const nextToken = randomUUID();
        let nextAdvanced = false;
        let nextAdvancedToId: string | undefined;

        const nextStageHandler = async ({
          summary,
          artifacts,
        }: import('../services/sherpa_mcp_server').StageCompleteInput): Promise<string> => {
          if (nextAdvanced) return 'Stage already advanced this turn; ignoring duplicate call.';

          const missing: string[] = [];
          for (const rel of artifacts) {
            try { await fsp.access(path.join(args.projectPath, rel)); }
            catch { missing.push(rel); }
          }
          if (missing.length > 0) {
            return (
              `Stage completion blocked — the following artifacts are missing from disk:\n` +
              missing.map((a) => `  - ${a}`).join('\n') +
              `\nCreate them and call sherpa_stage_complete again.`
            );
          }

          const nnId = findNextStageId(nextStage.id, loaded.methodology, 'pass');
          if (!nnId || nnId === nextStage.id) {
            return 'No next stage found — the methodology may already be complete.';
          }
          try {
            taskService.applySettings(args.taskId, { stageId: nnId });
          } catch (err) {
            return `Stage advance failed (could not persist): ${err instanceof Error ? err.message : String(err)}`;
          }

          nextAdvanced = true;
          nextAdvancedToId = nnId;
          methodologySessionIds.delete(args.taskId);

          const ts = new Date().toISOString();
          sendTaskEvent(event, {
            taskId: args.taskId,
            kind: 'engine_event',
            event: { kind: 'edge_traversed', from: nextStage.id, to: nnId, ts },
          });
          sendTaskEvent(event, {
            taskId: args.taskId,
            kind: 'engine_event',
            event: { kind: 'stage_entered', stageId: nnId, ts },
          });

          const advText =
            nnId === 'end'
              ? '✓ Методология завершена. Все этапы пройдены.'
              : `✓ Этап ${nextStage.id} завершён. Переходим к ${nnId}.`;
          const advMsg: import('../../core/domain/agent').AgentMessage = {
            id: `gate-${Date.now()}`,
            role: 'system',
            text: advText,
            timestamp: ts,
          };
          taskService.appendMessages(args.taskId, [advMsg]);
          sendTaskEvent(event, { taskId: args.taskId, kind: 'message', message: advMsg });

          return `Stage advanced to ${nnId}. ${summary}`;
        };

        sherpaMcpServer.registerSession(nextToken, nextStageHandler, args.taskId);
        const nextConfigPath = await sherpaMcpServer.writeMcpConfig(nextToken);

        void masterChat
          .runTurn(
            {
              userMessage: 'Начинай.',
              methodology: loaded.methodology,
              stage: nextStage,
              task: nextTask,
              cwd: args.projectPath,
              inputArtifacts: nextInputArtifacts,
              resumeSessionId: undefined,
              permissionMode: methPermissionMode,
              mcpConfigPath: nextConfigPath,
            },
            (msg) => {
              taskService.appendMessages(args.taskId, [msg]);
              sendTaskEvent(event, { taskId: args.taskId, kind: 'message', message: msg });
            },
          )
          .then(async (r) => {
            sherpaMcpServer.unregisterSession(nextToken);
            await fsp.unlink(nextConfigPath).catch(() => { /* best-effort */ });

            if (r.returnedSessionId && !nextAdvanced) {
              methodologySessionIds.set(args.taskId, r.returnedSessionId);
            }

            const upd =
              taskService.recordTurn(args.taskId, r.tokens) ??
              taskService.getTask(args.taskId)!;
            sendTaskEvent(event, { taskId: args.taskId, kind: 'done', task: upd });

            if (upd.compliance_review_enabled) {
              void triggerComplianceAutoRun(upd.id, args.projectPath);
            }

            if (nextAdvanced && nextAdvancedToId && nextAdvancedToId !== 'end') {
              void runAutoTurn(nextAdvancedToId);
            }
          })
          .catch((err: unknown) => {
            sherpaMcpServer.unregisterSession(nextToken);
            void fsp.unlink(nextConfigPath).catch(() => { /* best-effort */ });
            const message = err instanceof Error ? err.message : String(err);
            sendTaskEvent(event, { taskId: args.taskId, kind: 'error', message });
          });
      };

      const stageCompleteHandler = async ({
        summary,
        artifacts,
      }: import('../services/sherpa_mcp_server').StageCompleteInput): Promise<string> => {
        // Guard: tool called twice in the same turn — ignore the second call.
        if (stageAdvanced) {
          return 'Stage already advanced this turn; ignoring duplicate call.';
        }

        // Validate that claimed artifacts exist on disk.
        const taskRoot = args.projectPath;
        const missing: string[] = [];
        for (const rel of artifacts) {
          try {
            await fsp.access(path.join(taskRoot, rel));
          } catch {
            missing.push(rel);
          }
        }
        if (missing.length > 0) {
          return (
            `Stage completion blocked — the following artifacts are missing from disk:\n` +
            missing.map((a) => `  - ${a}`).join('\n') +
            `\nCreate them and call sherpa_stage_complete again.`
          );
        }

        // Advance stage.
        const nextId = findNextStageId(stage.id, loaded.methodology, 'pass');
        if (!nextId || nextId === stage.id) {
          return 'No next stage found — the methodology may already be complete.';
        }
        // Persist stage advance — must succeed before mutating in-process state.
        try {
          taskService.applySettings(args.taskId, { stageId: nextId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Stage advance failed (could not persist): ${msg}`;
        }

        // Only mutate in-process state after successful persist.
        stageAdvanced = true;
        advancedToStageId = nextId;
        methodologySessionIds.delete(args.taskId);

        const ts = new Date().toISOString();
        sendTaskEvent(event, {
          taskId: args.taskId,
          kind: 'engine_event',
          event: { kind: 'edge_traversed', from: stage.id, to: nextId, ts },
        });
        sendTaskEvent(event, {
          taskId: args.taskId,
          kind: 'engine_event',
          event: { kind: 'stage_entered', stageId: nextId, ts },
        });

        const advText =
          nextId === 'end'
            ? '✓ Методология завершена. Все этапы пройдены.'
            : `✓ Этап ${stage.id} завершён. Переходим к ${nextId}.`;
        const advMsg: import('../../core/domain/agent').AgentMessage = {
          id: `gate-${Date.now()}`,
          role: 'system',
          text: advText,
          timestamp: ts,
        };
        taskService.appendMessages(args.taskId, [advMsg]);
        sendTaskEvent(event, { taskId: args.taskId, kind: 'message', message: advMsg });

        return `Stage advanced to ${nextId}. ${summary}`;
      };

      // Register session BEFORE writing the config file so the token map is
      // populated before Claude Code can connect and send a stage-complete call.
      sherpaMcpServer.registerSession(mcpSessionToken, stageCompleteHandler, args.taskId);
      const mcpConfigPath = await sherpaMcpServer.writeMcpConfig(mcpSessionToken);

      // Kick off the turn fire-and-forget.
      void masterChat
        .runTurn(
          {
            userMessage: args.userMessage,
            methodology: loaded.methodology,
            stage,
            task: taskSnapshot,
            cwd: args.projectPath,
            inputArtifacts,
            resumeSessionId: methodologySessionIds.get(args.taskId),
            permissionMode: methPermissionMode,
            mcpConfigPath,
          },
          (msg) => {
            taskService.appendMessages(args.taskId, [msg]);
            sendTaskEvent(event, { taskId: args.taskId, kind: 'message', message: msg });
          },
        )
        .then(async (result) => {
          // Cleanup per-turn MCP session + temp file.
          sherpaMcpServer.unregisterSession(mcpSessionToken);
          await fsp.unlink(mcpConfigPath).catch(() => { /* best-effort */ });

          // Persist Claude Code session ID only if the stage did NOT advance
          // (new stage starts fresh without --resume).
          if (result.returnedSessionId && !stageAdvanced) {
            methodologySessionIds.set(args.taskId, result.returnedSessionId);
          }

          const updated =
            taskService.recordTurn(args.taskId, result.tokens) ??
            taskService.getTask(args.taskId)!;
          sendTaskEvent(event, {
            taskId: args.taskId,
            kind: 'done',
            task: updated,
          });
          // Auto-run compliance reviewer if enabled.
          if (updated.compliance_review_enabled) {
            void triggerComplianceAutoRun(updated.id, args.projectPath);
          }

          // Auto-continue: start the next stage automatically without
          // requiring the user to type "продолжай".
          if (stageAdvanced && advancedToStageId && advancedToStageId !== 'end') {
            void runAutoTurn(advancedToStageId);
          }
        })
        .catch((err: unknown) => {
          // Best-effort cleanup on error path too.
          sherpaMcpServer.unregisterSession(mcpSessionToken);
          void fsp.unlink(mcpConfigPath).catch(() => { /* best-effort */ });
          const message = err instanceof Error ? err.message : String(err);
          sendTaskEvent(event, { taskId: args.taskId, kind: 'error', message });
        });

      return { ok: true as const };
    },
  );

  // MetaMdStore is shared by the auto-run helper and the explicit
  // COMPLIANCE_REVIEW handler below. Declared here so both closures close
  // over the same instance.
  const metaStore = new MetaMdStoreImpl();

  // --- compliance auto-run helper ----------------------------------------
  // Called after TASK_START_TURN completes when compliance_review_enabled.
  // Reads complianceOutputMode from settings, runs the reviewer, writes file
  // and/or clipboard per the setting. Errors are swallowed (best-effort).
  const triggerComplianceAutoRun = async (
    taskId: string,
    projectPath: string,
  ): Promise<void> => {
    try {
      // Check output mode first — if 'off', do nothing.
      const userSettings = await settings.getUserSettings();
      const outputMode = userSettings.complianceOutputMode ?? 'file';
      if (outputMode === 'off') return;

      let agentPort;
      try {
        agentPort = container.resolve(PORT.agent);
      } catch {
        return; // agent port not available (tests / partial container)
      }
      const task = taskService.getTask(taskId);
      if (!task) return;
      // Compliance review requires a methodology — skip silently for
      // free-chat tasks (Plan 8b Task 7).
      if (!task.methodologyId) return;
      const loadedM = await methodology.load(projectPath, task.methodologyId);
      if (!loadedM.ok) return;
      const meta = await metaStore.load(projectPath, taskId);
      const taskDir = path.join(projectPath, '.sherpa', 'tasks', taskId);
      const trace = await readTrace(path.join(taskDir, 'trace.jsonl'));
      const artifacts: Record<string, string> = {};
      try {
        const entries = await fsp.readdir(taskDir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isFile()) continue;
          if (e.name === 'trace.jsonl' || e.name === 'meta.md' || e.name === 'compliance_review.md') continue;
          try {
            artifacts[e.name] = await fsp.readFile(path.join(taskDir, e.name), 'utf8');
          } catch { /* skip unreadable */ }
        }
      } catch { /* task dir may not exist */ }

      const reviewer = new ComplianceReviewer(agentPort);
      const reviewerArgs = {
        projectPath,
        taskId,
        methodology: loadedM.methodology,
        meta,
        trace,
        artifacts,
      };

      // Deliver per complianceOutputMode setting.
      if (outputMode === 'clipboard') {
        // Clipboard-only: get content without writing a file to disk.
        const content = await reviewer.reviewContent(reviewerArgs);
        clipboardWrite(content);
      } else {
        // 'file' or 'both': write the file.
        const result = await reviewer.review(reviewerArgs);
        if (outputMode === 'both') {
          clipboardWrite(result.content);
        }
      }
    } catch { /* best-effort; never surface to renderer */ }
  };

  // --- files.* -----------------------------------------------------------
  const files = container.resolve(PORT.files);

  ipcMain.handle(CH.FILES_READ_DIR, (_event, projectPath: string, relPath: string) =>
    files.readDir(projectPath, relPath),
  );

  ipcMain.handle(CH.FILES_READ_FILE, (_event, projectPath: string, relPath: string) =>
    files.readFile(projectPath, relPath),
  );

  ipcMain.handle(CH.FILES_WRITE_FILE, async (
    _event,
    projectPath: string,
    relPath: string,
    content: string,
  ) => {
    await files.writeFile(projectPath, relPath, content);
  });

  ipcMain.handle(CH.FILES_READ_BINARY, async (
    _event,
    projectPath: string,
    relPath: string,
  ) => {
    return files.readBinary(projectPath, relPath);
  });

  // --- trace.* (Plan 8 Task 17) -----------------------------------------
  // Reads the per-task NDJSON trace file. Missing file → []. Malformed
  // lines are skipped inside readTrace().
  ipcMain.handle(
    CH.TRACE_READ,
    async (_event, args: { projectPath: string; taskId: string }) => {
      if (
        !args ||
        typeof args.projectPath !== 'string' ||
        typeof args.taskId !== 'string' ||
        args.projectPath.length === 0 ||
        args.taskId.length === 0
      ) {
        return [];
      }
      const tracePath = path.join(
        args.projectPath,
        '.sherpa',
        'tasks',
        args.taskId,
        'trace.jsonl',
      );
      return readTrace(tracePath);
    },
  );

  // --- compliance.* (Plan 8 Task 18) ------------------------------------
  // Runs the methodology-compliance reviewer subagent against a completed
  // task: loads IR + meta + trace + artifacts, dispatches the registered
  // AgentPort, writes compliance_review.md, returns the result.
  //
  // AgentPort + MetaMdStore are resolved lazily inside the handler so that
  // pre-existing IPC tests (which register a partial container without the
  // agent token) keep working. Production buildContainer() registers both.
  ipcMain.handle(
    CH.COMPLIANCE_REVIEW,
    async (
      _event,
      args: { projectPath: string; taskId: string },
    ): Promise<
      | { ok: true; path: string; content: string }
      | { ok: false; error: string }
    > => {
      if (
        !args ||
        typeof args.projectPath !== 'string' ||
        typeof args.taskId !== 'string' ||
        args.projectPath.length === 0 ||
        args.taskId.length === 0
      ) {
        return { ok: false, error: 'invalid-args' };
      }
      let agentPort;
      try {
        agentPort = container.resolve(PORT.agent);
      } catch (err) {
        return { ok: false, error: `agent-port-unavailable: ${(err as Error).message}` };
      }
      const task = taskService.getTask(args.taskId);
      if (!task) return { ok: false, error: 'task-not-found' };
      if (!task.methodologyId) {
        return { ok: false, error: 'task-has-no-methodology' };
      }
      const loaded = await methodology.load(args.projectPath, task.methodologyId);
      if (!loaded.ok) {
        return { ok: false, error: `methodology-load-failed: ${loaded.error.kind}` };
      }
      const meta = await metaStore.load(args.projectPath, args.taskId);
      const taskDir = path.join(args.projectPath, '.sherpa', 'tasks', args.taskId);
      const trace = await readTrace(path.join(taskDir, 'trace.jsonl'));
      // Scan artifacts: every regular file in the task dir EXCEPT trace.jsonl,
      // meta.md, and any previous compliance_review.md. UTF-8 reads only.
      const artifacts: Record<string, string> = {};
      try {
        const entries = await fsp.readdir(taskDir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isFile()) continue;
          if (e.name === 'trace.jsonl' || e.name === 'meta.md' || e.name === 'compliance_review.md') {
            continue;
          }
          try {
            artifacts[e.name] = await fsp.readFile(path.join(taskDir, e.name), 'utf8');
          } catch {
            // Best-effort: a binary or unreadable artifact is omitted but does not
            // block the review.
          }
        }
      } catch {
        // Task dir may not exist — review still proceeds with no artifacts.
      }
      try {
        const reviewer = new ComplianceReviewer(agentPort);
        const result = await reviewer.review({
          projectPath: args.projectPath,
          taskId: args.taskId,
          methodology: loaded.methodology,
          meta,
          trace,
          artifacts,
        });
        return { ok: true, path: result.path, content: result.content };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  // --- task.meta + artifacts (Plan 8 Task 19) ---------------------------
  // Read the persisted TaskMeta projection (returns defaults if file missing).
  ipcMain.handle(
    CH.TASK_META_GET,
    async (_event, args: { projectPath: string; taskId: string }) => {
      if (
        !args ||
        typeof args.projectPath !== 'string' ||
        typeof args.taskId !== 'string' ||
        args.projectPath.length === 0 ||
        args.taskId.length === 0
      ) {
        return null;
      }
      return metaStore.load(args.projectPath, args.taskId);
    },
  );

  // Flip TaskMeta.status to 'paused'. Plan 8-fix Task 1: when the
  // supervisor is wired AND has an active run for this task, route
  // through it (the runner will reach the next stage boundary, call
  // metaStore.markPaused via its pause flow, and emit task_paused).
  // Otherwise fall back to a direct meta-only mutation.
  ipcMain.handle(
    CH.TASK_PAUSE,
    async (
      _event,
      args: { projectPath: string; taskId: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (
        !args ||
        typeof args.projectPath !== 'string' ||
        typeof args.taskId !== 'string' ||
        args.projectPath.length === 0 ||
        args.taskId.length === 0
      ) {
        return { ok: false, error: 'invalid-args' };
      }
      try {
        if (supervisor && supervisor.status(args.taskId) === 'running') {
          await supervisor.pause(args.taskId);
          return { ok: true };
        }
        await metaStore.markPaused(args.projectPath, args.taskId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  // Flip TaskMeta.status back to 'active'. Plan 8-fix Task 1: when the
  // supervisor is wired, attempt a re-bootstrap via resumeWithContext
  // (which loads meta, verifies status='paused', and re-enters start()).
  // Falls back to a meta-only setStatus when no supervisor exists OR the
  // supervisor declines to resume (e.g. task is already running).
  ipcMain.handle(
    CH.TASK_RESUME,
    async (
      _event,
      args: { projectPath: string; taskId: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (
        !args ||
        typeof args.projectPath !== 'string' ||
        typeof args.taskId !== 'string' ||
        args.projectPath.length === 0 ||
        args.taskId.length === 0
      ) {
        return { ok: false, error: 'invalid-args' };
      }
      try {
        if (supervisor) {
          const task = taskService.getTask(args.taskId);
          if (task) {
            await supervisor.resumeWithContext(task, args.projectPath);
            // resumeWithContext is a no-op when the task isn't paused;
            // still flip the meta cursor to 'active' so the meta-only
            // path stays consistent with previous behaviour.
            await metaStore.setStatus(args.projectPath, args.taskId, 'active');
            return { ok: true };
          }
        }
        await metaStore.setStatus(args.projectPath, args.taskId, 'active');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  // Plan 8-fix Task 1 — cooperative cancel. Routes through supervisor
  // when available; otherwise reports no-active-run.
  ipcMain.handle(
    CH.TASK_CANCEL,
    async (
      _event,
      args: { taskId: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (
        !args ||
        typeof args.taskId !== 'string' ||
        args.taskId.length === 0
      ) {
        return { ok: false, error: 'invalid-args' };
      }
      if (!supervisor) {
        return { ok: false, error: 'supervisor-unavailable' };
      }
      try {
        await supervisor.cancel(args.taskId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  // List artifact files in `<project>/.sherpa/tasks/<taskId>/chat_*` AND the
  // task root. Returns relative paths sorted lexicographically. Skips
  // bookkeeping files (trace.jsonl, meta.md, compliance_review.md).
  ipcMain.handle(
    CH.TASK_ARTIFACTS_LIST,
    async (
      _event,
      args: { projectPath: string; taskId: string },
    ): Promise<readonly string[]> => {
      if (
        !args ||
        typeof args.projectPath !== 'string' ||
        typeof args.taskId !== 'string' ||
        args.projectPath.length === 0 ||
        args.taskId.length === 0
      ) {
        return [];
      }
      const taskDir = path.join(
        args.projectPath,
        '.sherpa',
        'tasks',
        args.taskId,
      );
      const SKIP = new Set(['trace.jsonl', 'meta.md', 'compliance_review.md']);
      const out: string[] = [];
      async function walk(absDir: string, rel: string): Promise<void> {
        let entries;
        try {
          entries = await fsp.readdir(absDir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (rel === '' && SKIP.has(e.name)) continue;
          const childAbs = path.join(absDir, e.name);
          const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
          if (e.isDirectory()) {
            await walk(childAbs, childRel);
          } else if (e.isFile()) {
            out.push(childRel);
          }
        }
      }
      await walk(taskDir, '');
      out.sort();
      return out;
    },
  );

  // Read one artifact (UTF-8). Path is interpreted relative to the task dir.
  // Refuses absolute or `..` escapes.
  ipcMain.handle(
    CH.TASK_ARTIFACT_READ,
    async (
      _event,
      args: { projectPath: string; taskId: string; relPath: string },
    ): Promise<{ ok: true; content: string } | { ok: false; error: string }> => {
      if (
        !args ||
        typeof args.projectPath !== 'string' ||
        typeof args.taskId !== 'string' ||
        typeof args.relPath !== 'string' ||
        args.projectPath.length === 0 ||
        args.taskId.length === 0 ||
        args.relPath.length === 0
      ) {
        return { ok: false, error: 'invalid-args' };
      }
      if (path.isAbsolute(args.relPath) || args.relPath.includes('..')) {
        return { ok: false, error: 'invalid-path' };
      }
      const taskDir = path.join(
        args.projectPath,
        '.sherpa',
        'tasks',
        args.taskId,
      );
      const file = path.join(taskDir, args.relPath);
      try {
        const content = await fsp.readFile(file, 'utf8');
        return { ok: true, content };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle(
    CH.TASK_RUN_TURN,
    async (
      _event,
      args: { taskId: string; projectPath: string; userMessage: string },
    ) => {
      const task = taskService.getTask(args.taskId);
      if (!task) {
        return { ok: false as const, error: 'task-not-found' as const };
      }
      if (!task.methodologyId) {
        return { ok: false as const, error: 'task-has-no-methodology' as const };
      }
      const loaded = await methodology.load(args.projectPath, task.methodologyId);
      if (!loaded.ok) {
        return {
          ok: false as const,
          error: `methodology-load-failed: ${loaded.error.kind}`,
        };
      }
      const stage = loaded.methodology.stages.find((s) => s.id === task.stageId);
      if (!stage) {
        return { ok: false as const, error: 'stage-not-found' as const };
      }
      const runTurnProjSettings = await settings.getProjectSettings(args.projectPath);
      const runTurnPermissionMode = resolvePermMode(runTurnProjSettings?.permissionMode, task.ask_before_edit);

      const result = await masterChat.runTurn({
        userMessage: args.userMessage,
        methodology: loaded.methodology,
        stage,
        task,
        cwd: args.projectPath,
        permissionMode: runTurnPermissionMode,
      });
      const nowIso = (): string => new Date().toISOString();
      const userMsg = {
        id: `u-${Date.now()}`,
        role: 'user' as const,
        text: args.userMessage,
        timestamp: nowIso(),
      };
      const translationMsg =
        result.translatedText.length > 0
          ? [
              {
                id: `t-${Date.now()}`,
                role: 'system' as const,
                text: result.translatedText,
                timestamp: nowIso(),
              },
            ]
          : [];
      const updated = taskService.appendMessages(args.taskId, [
        userMsg,
        ...result.workerOutput,
        ...translationMsg,
      ]);
      return { ok: true as const, task: updated };
    },
  );

  // ── Cases domain ─────────────────────────────────────────────────────────
  // ProjectDatabase is created per-call (keyed on projectPath). better-sqlite3
  // returns the same WAL file; the overhead is one file open per call — acceptable
  // for MVP.

  let embeddingService: import('../services/embedding_service').EmbeddingService | undefined;
  try {
    embeddingService = container.resolve(PORT.embeddingService);
  } catch {
    embeddingService = undefined;
  }

  function caseServiceFor(projectPath: string): CaseService {
    const db = new ProjectDatabase(projectPath);
    return new CaseService(db);
  }

  function knowledgeServiceFor(projectPath: string): KnowledgeService {
    const db = new ProjectDatabase(projectPath);
    return new KnowledgeService(db);
  }

  function templateServiceFor(projectPath: string): TemplateService {
    const db = new ProjectDatabase(projectPath);
    return new TemplateService(db);
  }

  async function syncKnowledgeFile(
    projectPath: string,
    id: string,
    content: string | null,
  ): Promise<void> {
    const knowledgeDir = path.join(projectPath, '.sherpa', 'knowledge');
    const filePath = path.join(knowledgeDir, `${id}.md`);
    if (content === null) {
      try { await fsp.unlink(filePath); } catch { /* already gone */ }
      return;
    }
    await fsp.mkdir(knowledgeDir, { recursive: true });
    await fsp.writeFile(filePath, content, 'utf8');
  }

  ipcMain.handle(CH.CASES_CREATE, async (_e, projectPath: string, input: CreateCaseInput) => {
    const svc = caseServiceFor(projectPath);
    const c = svc.create(input);
    eventBus.emit('case.changed', { projectPath, caseId: c.id, action: 'created' });
    // Embed in background — don't await; vector search available after a few seconds.
    if (embeddingService) {
      embeddingService
        .embed(`${input.title} ${input.summary ?? ''} ${input.content ?? ''}`)
        .then((emb) => svc.upsertEmbedding(c.id, emb))
        .catch((err) => console.warn('[embedding] failed:', err));
    }
    return c;
  });

  ipcMain.handle(CH.CASES_GET, (_e, projectPath: string, id: string) =>
    caseServiceFor(projectPath).get(id),
  );

  ipcMain.handle(CH.CASES_LIST, (_e, projectPath: string) =>
    caseServiceFor(projectPath).list(),
  );

  ipcMain.handle(CH.CASES_DELETE, async (_e, projectPath: string, id: string) => {
    caseServiceFor(projectPath).delete(id);
    eventBus.emit('case.changed', { projectPath, caseId: id, action: 'deleted' });
  });

  ipcMain.handle(CH.CASES_FTS_SEARCH, (_e, projectPath: string, query: string) =>
    caseServiceFor(projectPath).ftsSearch(query),
  );

  ipcMain.handle(CH.CASES_VECTOR_SEARCH, async (_e, projectPath: string, query: string, k = 10) => {
    const svc = caseServiceFor(projectPath);
    if (!embeddingService) return [];
    const queryEmb = await embeddingService.embed(query);
    const hits = svc.vectorSearch(queryEmb, k);
    return hits
      .map((h) => ({ ...svc.get(h.caseId), distance: h.distance }))
      .filter((h) => h.id != null);
  });

  ipcMain.handle(CH.CASES_UNIFIED_SEARCH, async (_e, projectPath: string, query: string, limit = 10) => {
    const svc = caseServiceFor(projectPath);
    let queryEmb: Float32Array | null = null;
    if (embeddingService && query.trim()) {
      try {
        queryEmb = await embeddingService.embed(query);
      } catch {
        // vector unavailable — proceed with FTS + tag-graph only
      }
    }
    return svc.unifiedSearch(query, queryEmb, limit);
  });

  // ── Artifact templates domain ─────────────────────────────────────────────
  ipcMain.handle(CH.TEMPLATES_CREATE, async (_e, projectPath: string, input: CreateTemplateInput) => {
    const tmpl = templateServiceFor(projectPath).create(input);
    eventBus.emit('artifact_template.changed', { projectPath, templateId: tmpl.id, action: 'created' });
    return tmpl;
  });

  ipcMain.handle(CH.TEMPLATES_LIST, (_e, projectPath: string) =>
    templateServiceFor(projectPath).list(),
  );

  ipcMain.handle(CH.TEMPLATES_GET, (_e, projectPath: string, id: string) =>
    templateServiceFor(projectPath).get(id),
  );

  ipcMain.handle(
    CH.TEMPLATES_UPDATE,
    async (_e, projectPath: string, id: string, patch: Partial<CreateTemplateInput>) => {
      const svc = templateServiceFor(projectPath);
      const updated = svc.update(id, patch);
      if (updated) {
        eventBus.emit('artifact_template.changed', { projectPath, templateId: id, action: 'updated' });
      }
      return updated;
    },
  );

  ipcMain.handle(CH.TEMPLATES_DELETE, async (_e, projectPath: string, id: string) => {
    templateServiceFor(projectPath).delete(id);
    eventBus.emit('artifact_template.changed', { projectPath, templateId: id, action: 'deleted' });
  });

  // ── Knowledge domain ────────────────────────────────────────────────────────
  ipcMain.handle(CH.KNOWLEDGE_CREATE, async (_e, projectPath: string, input: CreateKnowledgeInput) => {
    const svc = knowledgeServiceFor(projectPath);
    const item = svc.create(input);
    await syncKnowledgeFile(projectPath, item.id, item.content);
    if (embeddingService) {
      embeddingService
        .embed(`${item.title} ${item.category ?? ''} ${item.content}`)
        .then((emb) => svc.upsertEmbedding(item.id, emb))
        .catch((err) => console.warn('[embedding] knowledge failed:', err));
    }
    eventBus.emit('knowledge.changed', { projectPath, knowledgeId: item.id, action: 'created' });
    return item;
  });

  ipcMain.handle(CH.KNOWLEDGE_LIST, (_e, projectPath: string) =>
    knowledgeServiceFor(projectPath).list(),
  );

  ipcMain.handle(CH.KNOWLEDGE_GET, (_e, projectPath: string, id: string) =>
    knowledgeServiceFor(projectPath).get(id),
  );

  ipcMain.handle(
    CH.KNOWLEDGE_UPDATE,
    async (_e, projectPath: string, id: string, patch: Partial<CreateKnowledgeInput>) => {
      const svc = knowledgeServiceFor(projectPath);
      const updated = svc.update(id, patch);
      if (updated) {
        await syncKnowledgeFile(projectPath, id, updated.content);
        if (embeddingService) {
          embeddingService
            .embed(`${updated.title} ${updated.category ?? ''} ${updated.content}`)
            .then((emb) => svc.upsertEmbedding(id, emb))
            .catch((err) => console.warn('[embedding] knowledge update failed:', err));
        }
        eventBus.emit('knowledge.changed', { projectPath, knowledgeId: id, action: 'updated' });
      }
      return updated;
    },
  );

  ipcMain.handle(CH.KNOWLEDGE_DELETE, async (_e, projectPath: string, id: string) => {
    knowledgeServiceFor(projectPath).delete(id);
    await syncKnowledgeFile(projectPath, id, null);
    eventBus.emit('knowledge.changed', { projectPath, knowledgeId: id, action: 'deleted' });
  });

  ipcMain.handle(CH.KNOWLEDGE_FTS_SEARCH, (_e, projectPath: string, query: string) =>
    knowledgeServiceFor(projectPath).ftsSearch(query),
  );

  ipcMain.handle(
    CH.KNOWLEDGE_VECTOR_SEARCH,
    async (_e, projectPath: string, query: string, k = 10) => {
      const svc = knowledgeServiceFor(projectPath);
      if (!embeddingService) return [];
      const queryEmb = await embeddingService.embed(query);
      const hits = svc.vectorSearch(queryEmb, k);
      return hits
        .map((h) => ({ ...svc.get(h.knowledgeId), distance: h.distance }))
        .filter((h) => h !== null);
    },
  );

  registerDebugHandlers();
}
