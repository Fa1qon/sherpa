// src/main/composition_root.ts
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { ProjectPort } from '../core/ports/project_port';
import type { SettingsPort } from '../core/ports/settings_port';
import type { MethodologyPort } from '../core/ports/methodology_port';
import type { AgentPort } from '../core/ports/agent_port';
import type { FilesPort } from '../core/ports/files_port';
import type { TaskSupervisorPort } from '../core/ports/task_supervisor_port';
import { ProjectService } from './services/project_service';
import { SettingsService } from './services/settings_service';
import { MethodologyService } from './services/methodology_service';
import { ClaudeCodeAdapter } from '../core/adapters/agents/claude_code';
import { MasterChatController } from './services/master_chat_controller';
import { TaskService } from './services/task_service';
import { FilesService } from './services/files_service';
import { StubAgentAdapter, isStubAdapterEnabled } from './adapters/stub_agent_adapter';
import { Container, token } from './container';
import { MetaMdStoreImpl } from './services/meta_md_store';
import {
  GateEvaluator,
  type FileSystemPort,
  type ReviewerOutcomeStore,
} from './services/gate_evaluator';
import { SystemPromptAssembler } from './services/system_prompt_assembler';
import { StageRunner } from './services/stage_runner';
import { MethodologyRunner } from './services/methodology_runner';
import { createTraceLogger } from './services/trace_logger';
import {
  TaskSupervisor,
  TaskEventEmitter,
} from './services/task_supervisor';
import type { Task } from '../core/domain/task';
import { EmbeddingService } from './services/embedding_service';
import { BrowserService } from './services/browser_service';
import { registerBrowserHandlers } from './ipc/browser_handlers';
import { TrackerService } from './services/tracker_service';
import { registerTrackerHandlers } from './ipc/tracker_handlers';

export const PORT = {
  project: token<ProjectPort>('ProjectPort'),
  settings: token<SettingsPort>('SettingsPort'),
  methodology: token<MethodologyPort>('MethodologyPort'),
  agent: token<AgentPort>('AgentPort'),
  masterChat: token<MasterChatController>('MasterChatController'),
  task: token<TaskService>('TaskService'),
  files: token<FilesPort>('FilesPort'),
  // Plan 8-fix Task 1 — engine lifecycle wiring.
  taskSupervisor: token<TaskSupervisorPort>('TaskSupervisorPort'),
  taskEvents: token<TaskEventEmitter>('TaskEventEmitter'),
  embeddingService: token<EmbeddingService>('EmbeddingService'),
  browserService: token<BrowserService>('BrowserService'),
  tracker: token<TrackerService>('TrackerService'),
} as const;

// ---------------------------------------------------------------------------
// Inline adapters used by GateEvaluator wiring.
// Kept here so the composition root remains the single owner of the
// dependency graph. Reviewer outcomes are deferred to a later plan; the
// no-op store keeps the gate evaluator path tractable.
// ---------------------------------------------------------------------------

const fsPort: FileSystemPort = {
  async listFilesRecursive(rootAbs: string): Promise<readonly string[]> {
    const out: string[] = [];
    async function walk(dir: string, rel: string): Promise<void> {
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const child = path.join(dir, e.name);
        const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
        if (e.isDirectory()) await walk(child, childRel);
        else if (e.isFile()) out.push(childRel);
      }
    }
    await walk(rootAbs, '');
    return out;
  },
};

const noReviewerOutcomes: ReviewerOutcomeStore = {
  async getPassedReviewers(): Promise<readonly string[]> {
    return [];
  },
};

export function buildContainer(): Container {
  const c = new Container();
  c.register(PORT.project, new ProjectService());
  c.register(PORT.settings, new SettingsService());
  c.register(PORT.methodology, new MethodologyService());
  // Plan 8 Task 20 — stub adapter switch for end-to-end tests.
  // When SHERPA_STUB_ADAPTER=1, the engine drives against an in-memory
  // adapter that resolves every turn immediately. Absent the env var, the
  // real Claude Code adapter is registered as before.
  const agent: AgentPort = isStubAdapterEnabled()
    ? new StubAgentAdapter()
    : new ClaudeCodeAdapter();
  c.register(PORT.agent, agent);
  const assembler = new SystemPromptAssembler();
  c.register(PORT.masterChat, new MasterChatController(agent, assembler));
  c.register(PORT.task, new TaskService());
  c.register(PORT.files, new FilesService());
  c.register(PORT.embeddingService, new EmbeddingService());

  // ----- Browser service (Task 6 — IPC channels) -------------------------
  const browserService = new BrowserService();
  c.register(PORT.browserService, browserService);
  registerBrowserHandlers(browserService);

  // ----- Tracker service (Task 5 — IPC channels) -------------------------
  const trackerService = new TrackerService();
  c.register(PORT.tracker, trackerService);
  registerTrackerHandlers(trackerService);

  // Task 11 — inject browser capability into system prompt when a session
  // is active for the running task.
  assembler.setBrowserService(browserService);
  // Lazy require keeps composition_root loadable in vitest (no real Electron).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app: Electron.App };
    app.on('before-quit', () => {
      void browserService.closeAll();
    });
  } catch { /* electron unavailable in test environment */ }

  // ----- Engine wiring (Plan 8-fix Task 1) -------------------------------
  const metaStore = new MetaMdStoreImpl();
  const evaluator = new GateEvaluator(fsPort, metaStore, noReviewerOutcomes);
  const taskEvents = new TaskEventEmitter();

  // Per-task runner factory: each call yields a fresh TraceLogger and
  // StageRunner anchored on `<projectPath>/.sherpa/tasks/<taskId>/`.
  // ArtifactStore is a placeholder writeArtifact stub until Plan 8a
  // wires the real one through the runner.
  //
  // Plan 8-fix Task 5 — under stub-adapter mode we additionally subscribe
  // to the runner's `event` stream and synthesize a per-stage artifact
  // file (`<projectPath>/.sherpa/tasks/<taskId>/<stageId>.md`) on every
  // `stage_completed` event. This is a stub-only side-effect that gives
  // ArtifactsPanel something to surface during e2e (production engine
  // will write real artifacts in Plan 8a). Failures are swallowed to
  // avoid blocking the engine loop.
  const runnerFactory = (task: Task, projectPath: string): MethodologyRunner => {
    const traceLogger = createTraceLogger(projectPath, task.id);
    const stageRunner = new StageRunner(
      assembler,
      agent,
      evaluator,
      traceLogger,
      metaStore,
      { writeArtifact: async () => undefined },
    );
    const runner = new MethodologyRunner(stageRunner, metaStore, traceLogger);
    if (isStubAdapterEnabled()) {
      runner.on('event', (e: { kind: string; stageId?: string }) => {
        if (e.kind === 'stage_completed' && typeof e.stageId === 'string') {
          const stageId = e.stageId;
          const file = path.join(
            projectPath,
            '.sherpa',
            'tasks',
            task.id,
            `${stageId}.md`,
          );
          // Fire-and-forget; failure logs nothing (engine must not crash).
          void fsp
            .mkdir(path.dirname(file), { recursive: true })
            .then(() => fsp.writeFile(file, `# ${stageId} (stub artifact)\n`, 'utf8'))
            .catch(() => undefined);
        }
      });
    }
    return runner;
  };

  const supervisor = new TaskSupervisor(
    c.resolve(PORT.methodology),
    runnerFactory,
    taskEvents,
    metaStore,
  );
  c.register(PORT.taskEvents, taskEvents);
  c.register(PORT.taskSupervisor, supervisor);

  return c;
}
