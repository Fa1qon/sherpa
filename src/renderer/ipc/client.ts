// src/renderer/ipc/client.ts
// Thin re-export of window.sherpa for code locality + test mocking.
// All renderer code goes through this module, never via window directly.

export const ipcClient = {
  project: () => window.sherpa.project,
  settings: () => window.sherpa.settings,
  shell: () => window.sherpa.shell,
  task: () => window.sherpa.task,
  files: () => window.sherpa.files,
  session: () => window.sherpa.session,
  methodology: () => window.sherpa.methodology,
  events: () => window.sherpa.events,
  knowledge: () => window.sherpa.knowledge,
  templates: () => window.sherpa.templates,
  observability: () => window.sherpa.observability,
  mobileWeb: () => window.sherpa.mobileWeb,
  trace: () => window.sherpa.trace,
  mcp: () => window.sherpa.mcp,
  // Extension Framework Plan 05 — Extension Manager UI.
  extensions: () => window.sherpa.extensions,
};
