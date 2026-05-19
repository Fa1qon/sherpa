// src/main/composition_root.ts
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { EventBus } from './services/event_bus';
import { EventBusDb } from './services/event_bus_db';
import { ExtensionStorage } from '../extensions/sdk/extension_storage';
import { ExtensionToolRegistry } from './services/extension_tool_registry';
import { ExtensionSlotRegistry } from './services/extension_slot_registry';
import { ExtensionStateStore } from './services/extension_state_store';
import { ExtensionLoader } from './services/extension_loader';
import { ExtensionInstaller } from './services/extension_installer';
import { registerExtensionHandlers } from './ipc/extension_handlers';
import { AggregatorDb } from './observability/aggregator_db';
import { EventAggregator } from './observability/event_aggregator';
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
import { PluginHandlerRegistry } from './plugins/handler_registry';
import { PluginExecutor } from './plugins/plugin_executor';
import { WebhookHandler } from './plugins/handlers/webhook_handler';
import { TransformHandler } from './plugins/handlers/transform_handler';
import { NotifyHandler } from './plugins/handlers/notify_handler';
import { McpClientPool } from './plugins/mcp/mcp_client_pool';
import { McpHandler } from './plugins/handlers/mcp_handler';
import { registerMcpHandlers } from './ipc/mcp_handlers';
import type { McpServerConfig } from '../core/domain/mcp_server';
import { MobileWebController } from './services/mobile_web_controller';
import { registerMobileWebHandlers } from './ipc/mobile_web_handlers';
import { InboundTriggerService } from './services/inbound_trigger_service';
import { InboundCronRunner } from './services/inbound_cron_runner';
import { InboundFileWatcher } from './services/inbound_file_watcher';
import { ExternalGateEvaluator } from './services/external_gate_evaluator';

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
  eventBus: token<EventBus>('EventBus'),
  // Track E Plan 01 — observability aggregator.
  aggregator: token<EventAggregator>('EventAggregator'),
  // Extension Framework Plan 03 — extension SDK registries.
  extensionStorage: token<ExtensionStorage>('ExtensionStorage'),
  extensionToolRegistry: token<ExtensionToolRegistry>('ExtensionToolRegistry'),
  extensionSlotRegistry: token<ExtensionSlotRegistry>('ExtensionSlotRegistry'),
  // Extension Framework Plan 05 — loader / installer / metadata store.
  extensionStateStore: token<ExtensionStateStore>('ExtensionStateStore'),
  extensionLoader: token<ExtensionLoader>('ExtensionLoader'),
  extensionInstaller: token<ExtensionInstaller>('ExtensionInstaller'),
  // Track D — Mobile Web controller.
  mobileWebController: token<MobileWebController>('MobileWebController'),
  // Track C Plan 03 — MCP plugin pool + cache refresher.
  mcpPool: token<McpClientPool>('McpClientPool'),
  refreshMcpServersCache: token<(next: readonly McpServerConfig[] | undefined) => void>(
    'refreshMcpServersCache',
  ),
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

  // Plan 02 (Extension Framework) — EventBus is constructed first so it can
  // be injected into every emitter service below. The SQLite-backed persistence
  // is lazy: we open `events.db` under `app.getPath('userData')` inside a
  // try/catch so vitest (where Electron is unavailable) still builds the
  // container — falling back to a bus with `db: null`.
  const eventBus = createEventBus();
  c.register(PORT.eventBus, eventBus);
  startEventPruneTimer(eventBus);

  // Track E Plan 01 — EventAggregator for stage/tool/gate metrics.
  const aggregator = createAnalyticsAggregator();

  c.register(PORT.project, new ProjectService({ bus: eventBus }));
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

  c.register(PORT.masterChat, new MasterChatController(registry, assembler, eventBus));
  c.register(PORT.task, new TaskService(eventBus));
  c.register(PORT.files, new FilesService(eventBus));
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

  // ----- Pipeline plugin executor (Track C Plan 02) ---------------------
  // Built BEFORE engine services so they can receive it as an injected dep.
  // MethodologyRunner.runInner() refreshes `pluginExecutor.setPlugins(...)`
  // from the active methodology at the start of each run.
  const pluginHandlerRegistry = new PluginHandlerRegistry();
  pluginHandlerRegistry.register('webhook', new WebhookHandler());
  pluginHandlerRegistry.register('transform', new TransformHandler());
  pluginHandlerRegistry.register('notify', new NotifyHandler());

  // ----- MCP plugin handler (Track C Plan 03) ---------------------------
  // The handler's `serversProvider` is a SYNC lambda but UserSettings load
  // is async (file-backed). We keep an in-memory cache hydrated:
  //  - once at startup via getUserSettings()
  //  - on every settings save (refreshMcpServersCache exported via PORT)
  // The cache start empty, so the first dispatch before hydration returns
  // an "unknown server" error rather than blocking — acceptable trade-off.
  const mcpPool = new McpClientPool();
  let mcpServersCache: readonly McpServerConfig[] = [];
  const settingsForMcp = c.resolve(PORT.settings);
  void settingsForMcp.getUserSettings().then((us) => {
    mcpServersCache = us.mcpServers ?? [];
  }).catch(() => { /* keep empty cache on failure */ });
  const refreshMcpServersCache = (next: readonly McpServerConfig[] | undefined): void => {
    mcpServersCache = next ?? [];
  };
  c.register(PORT.mcpPool, mcpPool);
  c.register(PORT.refreshMcpServersCache, refreshMcpServersCache);
  pluginHandlerRegistry.register(
    'mcp',
    new McpHandler(mcpPool, () => mcpServersCache),
  );
  registerMcpHandlers(mcpPool);
  // Disconnect pooled MCP clients on app quit. Lazy-electron pattern
  // identical to other before-quit hooks (no-op in vitest).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: Electron.App };
    if (app && typeof app.on === 'function') {
      app.on('before-quit', () => { void mcpPool.disconnectAll(); });
    }
  } catch { /* electron unavailable in test environment */ }

  const pluginExecutor = new PluginExecutor(pluginHandlerRegistry);

  // ----- Inbound triggers (Track C Plan 04) -----------------------------
  // InboundTriggerService starts a local HTTP listener on the configured
  // port (default 19222; 0 = random). The ExternalGateEvaluator awaits
  // pending triggers and is passed to GateEvaluator so that gates with
  // `kind === 'external'` short-circuit through the inbound runners.
  const inboundTriggerService = new InboundTriggerService();
  const inboundCronRunner = new InboundCronRunner();
  const inboundFileWatcher = new InboundFileWatcher();
  const externalGateEvaluator = new ExternalGateEvaluator(
    inboundTriggerService,
    inboundCronRunner,
    inboundFileWatcher,
  );
  // Hydrate port from UserSettings then start the listener (best-effort —
  // failures are logged and don't block app startup).
  void (async () => {
    try {
      const us = await c.resolve(PORT.settings).getUserSettings();
      const port = us.inboundTriggerPort ?? 19222;
      await inboundTriggerService.start(port);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[inbound-triggers] failed to start HTTP listener:', err);
    }
  })();
  // Stop on app quit. Lazy-electron pattern mirrors the MCP pool hook.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: Electron.App };
    if (app && typeof app.on === 'function') {
      app.on('before-quit', () => { void inboundTriggerService.stop(); });
    }
  } catch { /* electron unavailable in test environment */ }

  // ----- Engine wiring (Plan 8-fix Task 1) -------------------------------
  const metaStore = new MetaMdStoreImpl();
  const evaluator = new GateEvaluator(
    fsPort,
    metaStore,
    noReviewerOutcomes,
    pluginExecutor,
    externalGateEvaluator,
  );
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
      eventBus,
      pluginExecutor,
    );
    const runner = new MethodologyRunner(stageRunner, metaStore, traceLogger, pluginExecutor);

    // Track E Plan 01 — subscribe to runner events and forward to the
    // EventAggregator.  Wired here (not in StageRunner) so no existing
    // services need modification.  Tool correlation: LIFO stack keyed by
    // tool name; most-recent same-name unmatched call is paired first.
    const toolCallKeys = new Map<string, string[]>();
    runner.on('event', (e: { kind: string; [k: string]: unknown }) => {
      try {
        if (e.kind === 'stage_entered' && typeof e.stageId === 'string') {
          aggregator.recordStageStart(task.id, e.stageId);
        } else if (e.kind === 'stage_completed' && typeof e.stageId === 'string') {
          aggregator.recordStageComplete(task.id, e.stageId, 'success');
        } else if (e.kind === 'stage_failed' && typeof e.stageId === 'string') {
          aggregator.recordStageComplete(task.id, e.stageId, 'failed');
        } else if (e.kind === 'stage_rolled_back' && typeof e.stageId === 'string') {
          aggregator.recordStageComplete(task.id, e.stageId, 'skipped');
        } else if (e.kind === 'gate_evaluated' && typeof e.stageId === 'string') {
          const evalObj = e.evaluation as { kind?: string } | undefined;
          const passed =
            evalObj?.kind === 'pass' || evalObj?.kind === 'no_gate';
          aggregator.recordGate(
            task.id,
            e.stageId,
            passed ? 'pass' : 'fail',
          );
        } else if (e.kind === 'tool_call' && typeof e.name === 'string') {
          const inputSize =
            typeof e.args_excerpt === 'string' ? e.args_excerpt.length : 0;
          const key = aggregator.recordToolCall(task.id, e.name, inputSize);
          const stack = toolCallKeys.get(e.name) ?? [];
          stack.push(key);
          toolCallKeys.set(e.name, stack);
        } else if (e.kind === 'tool_result' && typeof e.name === 'string') {
          const stack = toolCallKeys.get(e.name);
          if (stack && stack.length > 0) {
            const key = stack.pop()!;
            if (stack.length === 0) toolCallKeys.delete(e.name);
            const ok = e.status === 'success';
            const outputSize =
              typeof e.result_excerpt === 'string' ? e.result_excerpt.length : 0;
            aggregator.recordToolResult(key, ok, outputSize);
          }
        }
      } catch {
        // Aggregator errors must never crash the engine.
      }
    });

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
    eventBus,
    pluginExecutor,
  );
  c.register(PORT.taskEvents, taskEvents);
  c.register(PORT.taskSupervisor, supervisor);
  c.register(PORT.aggregator, aggregator);

  // ----- Mobile Web (Track D) ---------------------------------------------
  // Static dir resolution: in production this is <install>/resources/dist-mobile,
  // in dev it's <repoRoot>/dist-mobile. Both reduce to app.getAppPath()/dist-mobile
  // when electron is available; tests fall back to cwd().
  let mobileStaticDir = path.resolve(process.cwd(), 'dist-mobile');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: Electron.App };
    if (app) mobileStaticDir = path.join(app.getAppPath(), 'dist-mobile');
  } catch { /* electron unavailable */ }

  const mobileWeb = new MobileWebController({
    settings: c.resolve(PORT.settings),
    taskService: c.resolve(PORT.task),
    gateEvaluator: evaluator,
    staticDir: mobileStaticDir,
  });
  c.register(PORT.mobileWebController, mobileWeb);
  registerMobileWebHandlers(mobileWeb);

  // Fire-and-forget start (do not block container construction).
  mobileWeb.startIfEnabled().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[mobile-web] failed to start:', err);
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app?: Electron.App };
    if (app) {
      app.on('before-quit', () => { void mobileWeb.stop(); });
    }
  } catch { /* electron unavailable */ }

  // Extension Framework Plan 03 — SDK registries.
  //
  // ExtensionStorage opens its own SQLite file under userData/extension_storage.db
  // (separate from events.db so a corrupt extension write cannot wedge the
  // event log). Falls back to an in-memory DB in vitest, same pattern as
  // EventBus.
  const extensionStorage = createExtensionStorage();
  const extensionToolRegistry = new ExtensionToolRegistry();
  const extensionSlotRegistry = new ExtensionSlotRegistry();
  c.register(PORT.extensionStorage, extensionStorage);
  c.register(PORT.extensionToolRegistry, extensionToolRegistry);
  c.register(PORT.extensionSlotRegistry, extensionSlotRegistry);

  // Extension Framework Plan 05 — state store + loader + installer.
  //
  // `<userData>/extensions/<id>/` is the root directory for installed
  // extensions. `extension_state.db` lives at the userData root and holds
  // per-extension metadata (enabled flag, settings JSON, install time).
  //
  // `loader.loadAll()` is fired asynchronously after construction so the
  // container build remains synchronous. Failures during scan are logged
  // but never fatal — a broken extension must not wedge app startup.
  const extensionsRootDir = resolveExtensionsRootDir();
  const extensionStateStore = createExtensionStateStore();
  const extensionInstaller = new ExtensionInstaller(extensionsRootDir);
  const extensionLoader = new ExtensionLoader({
    rootDir: extensionsRootDir,
    eventBus,
    storage: extensionStorage,
    toolRegistry: extensionToolRegistry,
    slotRegistry: extensionSlotRegistry,
    stateStore: extensionStateStore,
  });
  c.register(PORT.extensionStateStore, extensionStateStore);
  c.register(PORT.extensionInstaller, extensionInstaller);
  c.register(PORT.extensionLoader, extensionLoader);

  // Allow-list lambda backed by the loader: every IPC call from an
  // extension must come from a currently-loaded enabled one.
  const allowedExtIds = (): Set<string> =>
    new Set(
      extensionLoader
        .list()
        .filter((e) => e.enabled)
        .map((e) => e.manifest.id),
    );

  registerExtensionHandlers(extensionStorage, allowedExtIds, {
    loader: extensionLoader,
    installer: extensionInstaller,
    stateStore: extensionStateStore,
  });

  // Kick off the initial scan. Fire-and-forget — the container does not
  // block on extension I/O.
  void extensionLoader.loadAll().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[extension_loader] loadAll failed:', err);
  });

  return c;
}

// ---------------------------------------------------------------------------
// EventBus factory — Plan 02
// ---------------------------------------------------------------------------

/**
 * Build the global EventBus.
 *
 * Opens `events.db` under `app.getPath('userData')` for persistence. The
 * Electron import is lazy and wrapped in try/catch so vitest (no Electron
 * runtime) silently falls back to a memory-only bus with `db: null` — the
 * same pattern composition_root uses for the `app.on('before-quit')` hook.
 */
const EVENT_BUS_RETENTION_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Plan 02 Task 6 — daily prune.
 *
 * Schedules a 24-hour rotation pass that drops events older than
 * `EVENT_BUS_RETENTION_DAYS`. Uses `setInterval().unref()` so the timer
 * never blocks main-process shutdown. First sweep also runs at startup
 * to catch carry-over from prior sessions; failures are swallowed so a
 * busted DB never prevents container construction.
 */
function startEventPruneTimer(bus: EventBus): void {
  const sweep = (): void => {
    try {
      bus.pruneOlderThan(Date.now() - EVENT_BUS_RETENTION_DAYS * ONE_DAY_MS);
    } catch {
      // Pruning is best-effort.
    }
  };
  // Run once at startup, then on a daily cadence.
  sweep();
  const handle = setInterval(sweep, ONE_DAY_MS);
  // .unref so the timer does not keep the event loop alive on its own.
  if (typeof (handle as { unref?: () => void }).unref === 'function') {
    (handle as { unref: () => void }).unref();
  }
}

function createEventBus(): EventBus {
  let db: EventBusDb | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app: Electron.App };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const dbPath = path.join(app.getPath('userData'), 'events.db');
    db = new EventBusDb(new Database(dbPath));
  } catch {
    // Electron / better-sqlite3 unavailable (vitest). Fall back to memory-only.
    db = null;
  }
  return new EventBus(db);
}

// ---------------------------------------------------------------------------
// Analytics aggregator factory — Track E Plan 01
// ---------------------------------------------------------------------------

/**
 * Build the global EventAggregator.
 *
 * Opens `analytics.db` under `app.getPath('userData')` for persistence. The
 * Electron + better-sqlite3 imports are lazy and wrapped in try/catch so
 * vitest (no Electron runtime) silently falls back to a null-db aggregator
 * (all writes are no-ops; all reads return empty arrays) — the same pattern
 * used by `createEventBus`.
 */
/**
 * Build the global ExtensionStorage. Opens `extension_storage.db` under
 * `app.getPath('userData')`; falls back to an in-memory SQLite when
 * Electron is unavailable (vitest) — same lazy-electron pattern as
 * `createEventBus`. The in-memory fallback keeps `container.resolve`
 * deterministic in tests at the cost of non-persistence (acceptable —
 * tests that need persistence wire the DB explicitly).
 */
function createExtensionStorage(): ExtensionStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  let dbPath: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app: Electron.App };
    dbPath = path.join(app.getPath('userData'), 'extension_storage.db');
  } catch {
    // Electron unavailable — use in-memory DB so the container still builds.
    dbPath = ':memory:';
  }
  return new ExtensionStorage(new Database(dbPath));
}

/**
 * Build the ExtensionStateStore. Opens `extension_state.db` under
 * `app.getPath('userData')`; falls back to an in-memory SQLite under
 * vitest. Kept in a separate file from `extension_storage.db` so a
 * corrupt write to one cannot wedge the other.
 */
function createExtensionStateStore(): ExtensionStateStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  let dbPath: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app: Electron.App };
    dbPath = path.join(app.getPath('userData'), 'extension_state.db');
  } catch {
    dbPath = ':memory:';
  }
  return new ExtensionStateStore(new Database(dbPath));
}

/**
 * Resolve `<userData>/extensions/` (the install root). Mirrors the
 * lazy-electron pattern used by the DB factories: under vitest we fall
 * back to a temp directory so the container still builds, but the
 * loader's `loadAll()` will just see an empty scan there.
 */
function resolveExtensionsRootDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app: Electron.App };
    return path.join(app.getPath('userData'), 'extensions');
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('node:os') as typeof import('node:os');
    return path.join(os.tmpdir(), 'sherpa-ui-vitest-extensions');
  }
}

function createAnalyticsAggregator(): EventAggregator {
  let adb: AggregatorDb | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as { app: Electron.App };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const dbPath = path.join(app.getPath('userData'), 'analytics.db');
    adb = new AggregatorDb(new Database(dbPath));
  } catch {
    // Electron / better-sqlite3 unavailable (vitest). Fall back to no-op aggregator.
    adb = null;
  }
  return new EventAggregator(adb);
}

