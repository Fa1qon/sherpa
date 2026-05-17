// src/main/ipc/channels.ts
// IPC channel name constants. Renderer and main use these via the
// preload bridge. Naming convention: `domain.action`.

export const CH = {
  // Project domain (Plan 1)
  PROJECT_LIST_RECENT: 'project.listRecent',
  PROJECT_ADD: 'project.add',
  PROJECT_OPEN: 'project.open',
  PROJECT_REMOVE_FROM_RECENT: 'project.removeFromRecent',
  PROJECT_PICK_FOLDER: 'project.pickFolder',

  // Settings domain (Plan 1)
  SETTINGS_GET_USER: 'settings.getUser',
  SETTINGS_SET_USER: 'settings.setUser',
  SETTINGS_GET_PROJECT: 'settings.getProject',
  SETTINGS_SET_PROJECT: 'settings.setProject',

  // Methodology domain (Plan 2)
  METHODOLOGY_LIST: 'methodology.list',
  METHODOLOGY_LOAD: 'methodology.load',
  METHODOLOGY_SAVE: 'methodology.save',

  // Shell domain (Plan 3.5)
  SHELL_OPEN_PATH: 'shell.openPath',
  SHELL_OPEN_EXTERNAL: 'shell.openExternal',

  // Task domain (Plan 4)
  TASK_CREATE: 'task.create',
  TASK_GET: 'task.get',
  TASK_LIST: 'task.list',
  TASK_RUN_TURN: 'task.runTurn',
  TASK_START_TURN: 'task.startTurn',
  TASK_EVENT: 'task.event',

  // Files domain (Plan 4.5)
  FILES_READ_DIR: 'files.readDir',
  FILES_READ_FILE: 'files.readFile',
  FILES_WRITE_FILE: 'files.writeFile',
  FILES_READ_BINARY: 'files.readBinary',

  // Trace domain (Plan 8 Task 17) — read per-task trace.jsonl events.
  TRACE_READ: 'trace.read',

  // Compliance domain (Plan 8 Task 18) — run methodology-compliance reviewer.
  COMPLIANCE_REVIEW: 'task.complianceReview',

  // Runtime panels (Plan 8 Task 19) — meta read/write + artifacts.
  TASK_META_GET: 'task.metaGet',
  TASK_PAUSE: 'task.pause',
  TASK_RESUME: 'task.resume',
  TASK_ARTIFACTS_LIST: 'task.artifactsList',
  TASK_ARTIFACT_READ: 'task.artifactRead',
  // Engine lifecycle (Plan 8-fix Task 1) — cooperative cancel routed via
  // the TaskSupervisor. Pause/Resume already live above and are augmented
  // by the supervisor when an active engine run exists.
  TASK_CANCEL: 'sherpa.task.cancel',

  // Plan 8b Task 7 — TaskSettingsPanel apply/lock (first-send intercept).
  TASK_APPLY_SETTINGS: 'task.applySettings',
  TASK_LOCK_SETTINGS: 'task.lockSettings',
  TASK_DELETE: 'task.delete',

  // Cases domain (MVP)
  CASES_CREATE: 'cases.create',
  CASES_GET: 'cases.get',
  CASES_LIST: 'cases.list',
  CASES_DELETE: 'cases.delete',
  CASES_FTS_SEARCH: 'cases.ftsSearch',
  CASES_VECTOR_SEARCH: 'cases.vectorSearch',
  CASES_UNIFIED_SEARCH: 'cases.unifiedSearch',
  CASES_CHANGED: 'cases.changed',

  // Event bus push channel — main pushes typed app events to all windows.
  APP_EVENT: 'app.event',

  // Artifact templates domain
  TEMPLATES_CREATE: 'templates.create',
  TEMPLATES_LIST: 'templates.list',
  TEMPLATES_GET: 'templates.get',
  TEMPLATES_UPDATE: 'templates.update',
  TEMPLATES_DELETE: 'templates.delete',

  // Knowledge corpus domain
  KNOWLEDGE_CREATE: 'knowledge.create',
  KNOWLEDGE_LIST: 'knowledge.list',
  KNOWLEDGE_GET: 'knowledge.get',
  KNOWLEDGE_UPDATE: 'knowledge.update',
  KNOWLEDGE_DELETE: 'knowledge.delete',
  KNOWLEDGE_FTS_SEARCH: 'knowledge.ftsSearch',
  KNOWLEDGE_VECTOR_SEARCH: 'knowledge.vectorSearch',

  // Session domain — persist active task per project.
  SESSION_GET: 'session.get',
  SESSION_SET: 'session.set',

  // Tracker domain
  TRACKER_GET_BOARD_CONFIG:  'tracker.getBoardConfig',
  TRACKER_SET_BOARD_CONFIG:  'tracker.setBoardConfig',
  TRACKER_LIST_TASKS:        'tracker.listTasks',
  TRACKER_MOVE_TO_STAGE:     'tracker.moveToStage',
  TRACKER_ADD_TASK_TO_BOARD: 'tracker.addTaskToBoard',
  TRACKER_SET_FIELD:         'tracker.setField',

  // E2E debug channel — exposes backend errors to tests (only when SHERPA_DEBUG_E2E=1)
  DEBUG_GET_ERRORS: 'debug:get-errors',

  // Plans 2-5 add: methodology.*, task.*, agent.*, tool.*, cases.*, ...
} as const;

export type ChannelName = (typeof CH)[keyof typeof CH];
