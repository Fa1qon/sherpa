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
import { proxyManager } from './services/proxy_manager';
import { AgentRegistry } from './services/agent_registry';
import { AgentAuthService } from './services/agent_auth_service';
import { registerAgentHandlers } from './ipc/agent_handlers';
import { CodexAdapter } from '../core/adapters/agents/codex';
import { OpenCodeAdapter } from '../core/adapters/agents/opencode';
import { GeminiAdapter } from '../core/adapters/agents/gemini';
import { GooseAdapter } from '../core/adapters/agents/goose';
import { AmpAdapter } from '../core/adapters/agents/amp';
import { CursorAdapter } from '../core/adapters/agents/cursor';
import { CopilotAdapter } from '../core/adapters/agents/copilot';
import { PiAdapter } from '../core/adapters/agents/pi';
import { QwenCodeAdapter } from '../core/adapters/agents/qwen-code';
import { KimiAdapter } from '../core/adapters/agents/kimi';
import { AiderAdapter } from '../core/adapters/agents/aider';

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
  agentRegistry: token<AgentRegistry>('AgentRegistry'),
  agentAuth: token<AgentAuthService>('AgentAuthService'),
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
  // Lazy proxy env factory for the claudeAgent traffic target.
  // Called at each spawn so proxy setting changes are picked up immediately
  // for the next Claude Code turn — no restart required.
  // Both upper and lower case variants are included so Node.js and libcurl
  // honour the proxy regardless of which case they inspect.
  const agent: AgentPort = isStubAdapterEnabled()
    ? new StubAgentAdapter()
    : new ClaudeCodeAdapter({
        getProxyEnv: () => {
          const proxyUrl = proxyManager.getProxyUrl('claudeAgent');
          const noProxy = proxyManager.getNoProxy('claudeAgent');
          if (!proxyUrl) return {};
          return {
            HTTP_PROXY: proxyUrl,
            HTTPS_PROXY: proxyUrl,
            ALL_PROXY: proxyUrl,
            http_proxy: proxyUrl,
            https_proxy: proxyUrl,
            all_proxy: proxyUrl,
            ...(noProxy ? { NO_PROXY: noProxy, no_proxy: noProxy } : {}),
          };
        },
      });
  c.register(PORT.agent, agent);
  const assembler = new SystemPromptAssembler();

  // Build the registry and register all 12 adapters.
  const registry = new AgentRegistry();
  registry.register('claude-code', agent);
  registry.register('codex', new CodexAdapter());
  registry.register('opencode', new OpenCodeAdapter());
  registry.register('gemini', new GeminiAdapter());
  registry.register('goose', new GooseAdapter());
  registry.register('amp', new AmpAdapter());
  registry.register('cursor', new CursorAdapter());
  registry.register('copilot', new CopilotAdapter());
  registry.register('pi', new PiAdapter());
  registry.register('qwen-code', new QwenCodeAdapter());
  registry.register('kimi', new KimiAdapter());
  registry.register('aider', new AiderAdapter());
  c.register(PORT.agentRegistry, registry);

  const authService = new AgentAuthService(c.resolve(PORT.settings));
  c.register(PORT.agentAuth, authService);
  registerAgentHandlers(authService, registry);

  c.register(PORT.masterChat, new MasterChatController(registry, assembler));
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
