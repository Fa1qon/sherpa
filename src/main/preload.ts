// src/main/preload.ts
// Preload script — exposes a typed API to the renderer via contextBridge.
// The renderer NEVER imports electron directly; it only sees `window.sherpa`.

import { contextBridge, ipcRenderer } from 'electron';
import { CH } from './ipc/channels';
import type { AddProjectOptions, AddProjectResult } from '../core/ports/project_port';
import type { Project, RecentEntry } from '../core/domain/project';
import type { UserSettings, ProjectSettings } from '../core/domain/settings';
import type { MethodologySummary, LoadMethodologyResult } from '../core/ports/methodology_port';
import type { Methodology } from '../core/domain/methodology';
import type {
  Task,
  TaskEventPayload,
  EffortLevel,
  ResponseMode,
  EconomyMode,
  MethodologySelectionMode,
  StrictnessMode,
} from '../core/domain/task';
import type { DirEntry } from '../core/ports/files_port';
import type { LooseTraceEvent } from './services/trace_logger';
import type { TaskMeta } from '../core/domain/task_meta';
import type { KnowledgeItem, CreateKnowledgeInput } from '../core/domain/knowledge';
import type { ArtifactTemplate, CreateTemplateInput } from '../core/domain/artifact_template';
import type { SessionData } from './services/session_store';
import type { BrowserMode } from '../core/domain/browser';
import type { BoardConfig, TrackerTask, FieldValue } from '../core/domain/tracker';
import type { AgentCli } from '../core/domain/settings';
import type { QueryItem } from './services/browser_automation';
import type { ConsoleEntry } from './services/console_capture';
import type { NetworkEntry } from './services/network_capture';
import type {
  StageDurationEntry,
  GateOutcomeEntry,
  ToolUsageEntry,
} from './observability/aggregator_types';
import type { McpServerConfig } from '../core/domain/mcp_server';
import type { McpPingResult } from './ipc/mcp_handlers';

export type { TaskEventPayload };

const sherpa = {
  project: {
    listRecent: (): Promise<RecentEntry[]> => ipcRenderer.invoke(CH.PROJECT_LIST_RECENT),
    add: (opts: AddProjectOptions): Promise<AddProjectResult> =>
      ipcRenderer.invoke(CH.PROJECT_ADD, opts),
    open: (id: string): Promise<Project | null> => ipcRenderer.invoke(CH.PROJECT_OPEN, id),
    removeFromRecent: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(CH.PROJECT_REMOVE_FROM_RECENT, id),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(CH.PROJECT_PICK_FOLDER),
  },
  settings: {
    getUser: (): Promise<UserSettings> => ipcRenderer.invoke(CH.SETTINGS_GET_USER),
    setUser: (s: UserSettings): Promise<void> => ipcRenderer.invoke(CH.SETTINGS_SET_USER, s),
    getProject: (projectPath: string): Promise<ProjectSettings> =>
      ipcRenderer.invoke(CH.SETTINGS_GET_PROJECT, projectPath),
    setProject: (projectPath: string, s: ProjectSettings): Promise<void> =>
      ipcRenderer.invoke(CH.SETTINGS_SET_PROJECT, projectPath, s),
  },
  methodology: {
    list: (projectPath: string): Promise<MethodologySummary[]> =>
      ipcRenderer.invoke(CH.METHODOLOGY_LIST, projectPath),
    load: (projectPath: string, id: string): Promise<LoadMethodologyResult> =>
      ipcRenderer.invoke(CH.METHODOLOGY_LOAD, projectPath, id),
    save: (projectPath: string, m: Methodology): Promise<void> =>
      ipcRenderer.invoke(CH.METHODOLOGY_SAVE, projectPath, m),
  },
  shell: {
    openPath: (path: string): Promise<string> =>
      ipcRenderer.invoke(CH.SHELL_OPEN_PATH, path),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(CH.SHELL_OPEN_EXTERNAL, url),
  },
  task: {
    // Plan 8-fix Task 1 — `create` now optionally takes projectPath +
    // autoStart. When BOTH are present (autoStart defaults to true when
    // projectPath is supplied), the main-process supervisor bootstraps
    // the engine runner immediately. Backwards-compatible: existing
    // callers pass only {methodologyId, stageId} and get the meta-only
    // task back as before.
    create: (
      opts: {
        // Plan 8b Task 7 — only `title` is required for new tasks; all
        // engine settings are deferred to TaskSettingsPanel (first send).
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
        strictness_mode?: StrictnessMode;
      },
    ): Promise<Task> => ipcRenderer.invoke(CH.TASK_CREATE, opts),
    // Plan 8b Task 7 — TaskSettingsPanel apply/lock.
    applySettings: (
      id: string,
      settings: {
        title?: string;
        methodologyId?: string;
        stageId?: string;
        methodology_selection_mode?: MethodologySelectionMode;
        effort?: EffortLevel;
        response_mode?: ResponseMode;
        economy_mode?: EconomyMode;
        compliance_review_enabled?: boolean;
        strictness_mode?: StrictnessMode;
        ask_before_edit?: boolean;
        agentCli?: AgentCli;
      },
    ): Promise<Task | null> => ipcRenderer.invoke(CH.TASK_APPLY_SETTINGS, id, settings),
    lockSettings: (id: string): Promise<Task | null> =>
      ipcRenderer.invoke(CH.TASK_LOCK_SETTINGS, id),
    get: (id: string): Promise<Task | null> => ipcRenderer.invoke(CH.TASK_GET, id),
    list: (projectPath?: string): Promise<readonly Task[]> => ipcRenderer.invoke(CH.TASK_LIST, projectPath),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(CH.TASK_DELETE, id),
    cancel: (
      args: { taskId: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.TASK_CANCEL, args),
    runTurn: (
      args: { taskId: string; projectPath: string; userMessage: string },
    ): Promise<{ ok: true; task: Task } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.TASK_RUN_TURN, args),
    startTurn: (args: { taskId: string; projectPath: string; userMessage: string }):
      Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.TASK_START_TURN, args),
    onEvent: (handler: (payload: TaskEventPayload) => void): (() => void) => {
      const wrapped = (_e: unknown, payload: TaskEventPayload) => handler(payload);
      ipcRenderer.on(CH.TASK_EVENT, wrapped);
      return () => ipcRenderer.removeListener(CH.TASK_EVENT, wrapped);
    },
    // Plan 8 Task 18 — methodology compliance reviewer.
    complianceReview: (
      args: { projectPath: string; taskId: string },
    ): Promise<
      | { ok: true; path: string; content: string }
      | { ok: false; error: string }
    > => ipcRenderer.invoke(CH.COMPLIANCE_REVIEW, args),
    // Plan 8 Task 19 — runtime panels: meta read + pause/resume + artifacts.
    metaGet: (args: { projectPath: string; taskId: string }): Promise<TaskMeta | null> =>
      ipcRenderer.invoke(CH.TASK_META_GET, args),
    pause: (
      args: { projectPath: string; taskId: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.TASK_PAUSE, args),
    resume: (
      args: { projectPath: string; taskId: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.TASK_RESUME, args),
    artifactsList: (
      args: { projectPath: string; taskId: string },
    ): Promise<readonly string[]> =>
      ipcRenderer.invoke(CH.TASK_ARTIFACTS_LIST, args),
    artifactRead: (
      args: { projectPath: string; taskId: string; relPath: string },
    ): Promise<{ ok: true; content: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.TASK_ARTIFACT_READ, args),
  },
  files: {
    readDir: (projectPath: string, relPath: string): Promise<DirEntry[]> =>
      ipcRenderer.invoke(CH.FILES_READ_DIR, projectPath, relPath),
    readFile: (projectPath: string, relPath: string): Promise<string> =>
      ipcRenderer.invoke(CH.FILES_READ_FILE, projectPath, relPath),
    writeFile: (projectPath: string, relPath: string, content: string): Promise<void> =>
      ipcRenderer.invoke(CH.FILES_WRITE_FILE, projectPath, relPath, content),
    readBinary: (projectPath: string, relPath: string): Promise<string> =>
      ipcRenderer.invoke(CH.FILES_READ_BINARY, projectPath, relPath),
  },
  trace: {
    // Plan 8 Task 17 — read per-task trace.jsonl. Missing file → [].
    read: (args: { projectPath: string; taskId: string }): Promise<LooseTraceEvent[]> =>
      ipcRenderer.invoke(CH.TRACE_READ, args),
  },
  cases: {
    create: (projectPath: string, input: {
      title: string;
      summary?: string;
      content?: string;
      tags?: string[];
      methodology_id?: string;
      source_task_id?: string;
      confidence?: 'low' | 'medium' | 'high';
    }): Promise<unknown> => ipcRenderer.invoke(CH.CASES_CREATE, projectPath, input),
    get: (projectPath: string, id: string): Promise<unknown> =>
      ipcRenderer.invoke(CH.CASES_GET, projectPath, id),
    list: (projectPath: string): Promise<unknown[]> =>
      ipcRenderer.invoke(CH.CASES_LIST, projectPath),
    delete: (projectPath: string, id: string): Promise<void> =>
      ipcRenderer.invoke(CH.CASES_DELETE, projectPath, id),
    ftsSearch: (projectPath: string, query: string): Promise<unknown[]> =>
      ipcRenderer.invoke(CH.CASES_FTS_SEARCH, projectPath, query),
    vectorSearch: (projectPath: string, query: string, k?: number): Promise<unknown[]> =>
      ipcRenderer.invoke(CH.CASES_VECTOR_SEARCH, projectPath, query, k),
    unifiedSearch: (projectPath: string, query: string, limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke(CH.CASES_UNIFIED_SEARCH, projectPath, query, limit),
    onChanged: (handler: (projectPath: string) => void): (() => void) => {
      const wrapped = (_e: unknown, projectPath: string) => handler(projectPath);
      ipcRenderer.on(CH.CASES_CHANGED, wrapped);
      return () => ipcRenderer.removeListener(CH.CASES_CHANGED, wrapped);
    },
  },
  session: {
    get: (projectPath: string): Promise<SessionData> =>
      ipcRenderer.invoke(CH.SESSION_GET, projectPath),
    set: (
      projectPath: string,
      data: SessionData,
    ): Promise<void> => ipcRenderer.invoke(CH.SESSION_SET, projectPath, data),
  },
  templates: {
    create: (projectPath: string, input: CreateTemplateInput): Promise<ArtifactTemplate> =>
      ipcRenderer.invoke(CH.TEMPLATES_CREATE, projectPath, input),
    list: (projectPath: string): Promise<ArtifactTemplate[]> =>
      ipcRenderer.invoke(CH.TEMPLATES_LIST, projectPath),
    get: (projectPath: string, id: string): Promise<ArtifactTemplate | null> =>
      ipcRenderer.invoke(CH.TEMPLATES_GET, projectPath, id),
    update: (
      projectPath: string,
      id: string,
      patch: Partial<CreateTemplateInput>,
    ): Promise<ArtifactTemplate | null> =>
      ipcRenderer.invoke(CH.TEMPLATES_UPDATE, projectPath, id, patch),
    delete: (projectPath: string, id: string): Promise<void> =>
      ipcRenderer.invoke(CH.TEMPLATES_DELETE, projectPath, id),
  },
  knowledge: {
    create: (projectPath: string, input: CreateKnowledgeInput): Promise<KnowledgeItem> =>
      ipcRenderer.invoke(CH.KNOWLEDGE_CREATE, projectPath, input),
    list: (projectPath: string): Promise<KnowledgeItem[]> =>
      ipcRenderer.invoke(CH.KNOWLEDGE_LIST, projectPath),
    get: (projectPath: string, id: string): Promise<KnowledgeItem | null> =>
      ipcRenderer.invoke(CH.KNOWLEDGE_GET, projectPath, id),
    update: (
      projectPath: string,
      id: string,
      patch: Partial<CreateKnowledgeInput>,
    ): Promise<KnowledgeItem | null> =>
      ipcRenderer.invoke(CH.KNOWLEDGE_UPDATE, projectPath, id, patch),
    delete: (projectPath: string, id: string): Promise<void> =>
      ipcRenderer.invoke(CH.KNOWLEDGE_DELETE, projectPath, id),
    ftsSearch: (projectPath: string, query: string): Promise<KnowledgeItem[]> =>
      ipcRenderer.invoke(CH.KNOWLEDGE_FTS_SEARCH, projectPath, query),
    vectorSearch: (projectPath: string, query: string, k?: number): Promise<KnowledgeItem[]> =>
      ipcRenderer.invoke(CH.KNOWLEDGE_VECTOR_SEARCH, projectPath, query, k),
  },
  events: {
    onAppEvent: (
      handler: (eventName: string, payload: unknown) => void,
    ): (() => void) => {
      const wrapped = (_e: unknown, eventName: string, payload: unknown) =>
        handler(eventName, payload);
      ipcRenderer.on(CH.APP_EVENT, wrapped);
      return () => ipcRenderer.removeListener(CH.APP_EVENT, wrapped);
    },
    // Plan 02 (Extension Framework) — typed AppEvent subscription.
    //
    // The new EventBus broadcasts single-arg payloads:
    //   `w.webContents.send(CH.APP_EVENT, ev)`
    // The legacy `setupIpcEventBridge` keeps the two-arg shape
    //   `w.webContents.send(CH.APP_EVENT, eventName, payload)`
    // for backwards compatibility. We disambiguate here by inspecting
    // the FIRST argument after the IpcRendererEvent: when it is an
    // object with a `.type` string, treat it as the Plan 02 single-arg
    // payload; otherwise it's the legacy two-arg shape and we ignore it.
    on: (type: string, cb: (ev: unknown) => void): (() => void) => {
      const wrapped = (_e: unknown, first: unknown): void => {
        if (typeof first !== 'object' || first === null) return;
        const ev = first as { type?: unknown };
        if (typeof ev.type !== 'string') return;
        if (type === '*' || ev.type === type) cb(first);
      };
      ipcRenderer.on(CH.APP_EVENT, wrapped);
      return () => ipcRenderer.removeListener(CH.APP_EVENT, wrapped);
    },
  },
  app: {
    openDevTools: (): void => { ipcRenderer.send('app:open-devtools'); },
  },
  browserTools: {
    navigate: (url: string): Promise<{ ok: boolean; finalUrl: string }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_NAVIGATE, url),
    screenshot: (opts?: { fullPage?: boolean }): Promise<{ base64: string; width: number; height: number }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_SCREENSHOT, opts),
    getHtml: (selector?: string): Promise<{ html: string }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_GET_HTML, selector),
    querySelector: (selector: string, all?: boolean): Promise<{ count: number; items: QueryItem[] }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_QUERY_SELECTOR, selector, all),
    evaluateJs: (code: string): Promise<{ result?: unknown; error?: string }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_EVALUATE_JS, code),
    click: (selector: string, button?: 'left' | 'right' | 'middle'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_CLICK, selector, button),
    type: (selector: string, text: string, delay?: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_TYPE, selector, text, delay),
    key: (key: string, modifiers?: string[]): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_KEY, key, modifiers),
    drag: (from: { x: number; y: number }, to: { x: number; y: number }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_DRAG, from, to),
    resize: (width: number, height: number): Promise<{ ok: boolean; actual: { width: number; height: number } }> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_RESIZE, width, height),
    consoleErrors: (sinceMs?: number): Promise<ConsoleEntry[]> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_CONSOLE_ERRORS, sinceMs),
    networkLog: (sinceMs?: number, filterMime?: string): Promise<NetworkEntry[]> =>
      ipcRenderer.invoke(CH.BROWSER_TOOL_NETWORK_LOG, sinceMs, filterMime),
  },
  ubrowser: {
    // NEW: register/unregister the renderer-owned <webview>'s webContents
    // id so main can route navigation + MCP automation through it.
    registerWebContentsId: (id: number | null): Promise<void> =>
      ipcRenderer.invoke('ubrowser:attach', id),
    // Legacy methods kept for back-compat with any caller still routing
    // through main. The new BrowserTab calls webview methods directly.
    show: (x: number, y: number, w: number, h: number, url?: string): Promise<void> =>
      ipcRenderer.invoke('ubrowser:show', x, y, w, h, url),
    hide: (): Promise<void> => ipcRenderer.invoke('ubrowser:hide'),
    navigate: (url: string): Promise<void> => ipcRenderer.invoke('ubrowser:navigate', url),
    back: (): Promise<void> => ipcRenderer.invoke('ubrowser:back'),
    forward: (): Promise<void> => ipcRenderer.invoke('ubrowser:forward'),
    reload: (): Promise<void> => ipcRenderer.invoke('ubrowser:reload'),
    onUrlChanged: (handler: (url: string, title: string) => void): (() => void) => {
      const listener = (_e: unknown, url: string, title: string): void => handler(url, title);
      ipcRenderer.on('ubrowser:url-changed', listener);
      return () => ipcRenderer.removeListener('ubrowser:url-changed', listener);
    },
  },
  browser: {
    open: (taskId: string, mode: BrowserMode) =>
      ipcRenderer.invoke('browser:open', taskId, mode),
    close: (taskId: string) =>
      ipcRenderer.invoke('browser:close', taskId),
    navigate: (taskId: string, url: string) =>
      ipcRenderer.invoke('browser:navigate', taskId, url),
    screenshot: (taskId: string) =>
      ipcRenderer.invoke('browser:screenshot', taskId),
    click: (taskId: string, selector: string) =>
      ipcRenderer.invoke('browser:click', taskId, selector),
    type: (taskId: string, selector: string, text: string) =>
      ipcRenderer.invoke('browser:type', taskId, selector, text),
    evaluate: (taskId: string, script: string) =>
      ipcRenderer.invoke('browser:evaluate', taskId, script),
    getDOM: (taskId: string) =>
      ipcRenderer.invoke('browser:get-dom', taskId),
    waitFor: (taskId: string, selector: string, timeoutMs?: number) =>
      ipcRenderer.invoke('browser:wait-for', taskId, selector, timeoutMs),
    highlight: (taskId: string, selector: string) =>
      ipcRenderer.invoke('browser:highlight', taskId, selector),
    onEvent: (handler: (taskId: string, event: unknown) => void) => {
      const listener = (_: unknown, taskId: string, ev: unknown) => handler(taskId, ev);
      ipcRenderer.on('browser:event', listener);
      return () => ipcRenderer.off('browser:event', listener);
    },
  },
  tracker: {
    getBoardConfig: (projectPath: string): Promise<BoardConfig> =>
      ipcRenderer.invoke(CH.TRACKER_GET_BOARD_CONFIG, projectPath),
    setBoardConfig: (projectPath: string, config: BoardConfig): Promise<void> =>
      ipcRenderer.invoke(CH.TRACKER_SET_BOARD_CONFIG, projectPath, config),
    listTasks: (projectPath: string): Promise<TrackerTask[]> =>
      ipcRenderer.invoke(CH.TRACKER_LIST_TASKS, projectPath),
    moveToStage: (projectPath: string, taskId: string, stageId: string): Promise<TrackerTask | null> =>
      ipcRenderer.invoke(CH.TRACKER_MOVE_TO_STAGE, projectPath, taskId, stageId),
    addTaskToBoard: (projectPath: string, taskId: string, stageId: string): Promise<TrackerTask> =>
      ipcRenderer.invoke(CH.TRACKER_ADD_TASK_TO_BOARD, projectPath, taskId, stageId),
    setField: (projectPath: string, taskId: string, fieldId: string, value: FieldValue): Promise<TrackerTask | null> =>
      ipcRenderer.invoke(CH.TRACKER_SET_FIELD, projectPath, taskId, fieldId, value),
  },
  debug: {
    getErrors: (): Promise<unknown[]> => ipcRenderer.invoke(CH.DEBUG_GET_ERRORS),
  },
  agent: {
    storeKey: (agentId: AgentCli, apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.AGENT_STORE_KEY, agentId, apiKey),
    revoke: (agentId: AgentCli): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.AGENT_AUTH_REVOKE, agentId),
    authStatus: (agentId: AgentCli): Promise<{ hasCredential: false } | { hasCredential: true; type: 'apikey' | 'oauth' }> =>
      ipcRenderer.invoke(CH.AGENT_AUTH_STATUS, agentId),
    health: (agentId: AgentCli): Promise<{ ok: true } | { ok: false; reason: string }> =>
      ipcRenderer.invoke(CH.AGENT_HEALTH, agentId),
  },
  observability: {
    // Track E Plan 01 — aggregated stage/tool/gate metrics.
    stageDurations: (): Promise<StageDurationEntry[]> =>
      ipcRenderer.invoke(CH.OBSERV_STAGE_DURATIONS),
    gateOutcomes: (): Promise<GateOutcomeEntry[]> =>
      ipcRenderer.invoke(CH.OBSERV_GATE_OUTCOMES),
    toolUsage: (): Promise<ToolUsageEntry[]> =>
      ipcRenderer.invoke(CH.OBSERV_TOOL_USAGE),
  },
  mobileWeb: {
    status: (): Promise<{ running: boolean; port?: number; lanIp?: string }> =>
      ipcRenderer.invoke(CH.MOBILE_WEB_STATUS),
    setPin: (pin: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.MOBILE_WEB_SET_PIN, pin),
    restart: (): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke(CH.MOBILE_WEB_RESTART),
  },
  // Track C Plan 03 — test-ping a configured MCP server. Returns the
  // connected tools or a single error string. Fully stateless: the main
  // process closes the connection after the ping.
  mcp: {
    ping: (cfg: McpServerConfig): Promise<McpPingResult> =>
      ipcRenderer.invoke(CH.MCP_PING, cfg),
  },
  // Extension Framework Plan 03 Task 7 — per-extension key/value storage.
  // Main-side handler validates `extId` against the loaded-extensions
  // allow-list before reading/writing.
  extension: {
    storage: {
      get: (extId: string, key: string): Promise<unknown> =>
        ipcRenderer.invoke(CH.EXTENSION_STORAGE_GET, extId, key),
      set: (extId: string, key: string, val: unknown): Promise<void> =>
        ipcRenderer.invoke(CH.EXTENSION_STORAGE_SET, extId, key, val),
      delete: (extId: string, key: string): Promise<void> =>
        ipcRenderer.invoke(CH.EXTENSION_STORAGE_DELETE, extId, key),
    },
  },
  // Extension Framework Plan 05 — Extension Manager UI.
  extensions: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke(CH.EXTENSION_LIST),
    enable: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke(CH.EXTENSION_ENABLE, id),
    disable: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke(CH.EXTENSION_DISABLE, id),
    installZip: (
      zipPath: string,
    ): Promise<{ ok: boolean; extensionId?: string; errors?: string[] }> =>
      ipcRenderer.invoke(CH.EXTENSION_INSTALL_ZIP, zipPath),
    installDir: (
      sourceDir: string,
    ): Promise<{ ok: boolean; extensionId?: string; errors?: string[] }> =>
      ipcRenderer.invoke(CH.EXTENSION_INSTALL_DIR, sourceDir),
    uninstall: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke(CH.EXTENSION_UNINSTALL, id),
    getSettings: (id: string): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(CH.EXTENSION_GET_SETTINGS, id),
    setSettings: (id: string, settings: Record<string, unknown>): Promise<{ ok: true }> =>
      ipcRenderer.invoke(CH.EXTENSION_SET_SETTINGS, id, settings),
    pickZip: (): Promise<string | null> => ipcRenderer.invoke(CH.EXTENSION_PICK_ZIP),
  },
};

contextBridge.exposeInMainWorld('sherpa', sherpa);

export type SherpaApi = typeof sherpa;
