# Presentation

React components per screen — the renderer-process UI layer.

## Purpose

The presentation layer renders every Sherpa UI Client screen and turns
user input into use-case invocations on the application layer. It runs
in the Electron renderer process and reaches the main process only
through the typed IPC bridge owned by `src/main/ipc/`. Per ADR-001 §3
dep rule #4 the renderer never imports from `core/adapters/*` or
`core/infrastructure` — that isolation is what lets us swap Electron
for another shell in the long term without rewriting screens.

Subdirectories:

- `screens/` — top-level routes per `design/ui.md §4`:
  - `Welcome/` — first-launch entry point, recent projects, action
    grid, onboarding tour overlay (FR42, FR18).
  - `Workspace/` — main work surface: ActivityBar, StageStrip,
    StatusBar, ResizablePanel, TaskContextSidebar, RightPaneRouter.
  - `Kanban/` — methodology stage board (FR11-FR15).
  - `RagSearch/` — vector search with privacy preview.
  - `Graph/` — Cytoscape knowledge graph viewer (FR22).
  - `Settings/` — General / Methodology / Agent / RAG / Hooks /
    Updates / Plugins / Privacy tabs.
  - `Recovery/` — post-crash session list (F8 / FR48-FR50).
  - `Metrics/` — cost / token / session aggregates.
- `components/` — reusable primitives:
  - `AgentPanel/` — agent conversation host with PermissionVisualizer,
    DecisionFork and ContextManager.
  - `Editor/` — CodeMirror 6 wrapper (ADR-005).
  - `FileBrowser/` — react-arborist file tree.
  - `Notifications/` — Banner, ModalAlert, toasts.
  - `Onboarding/` — TourOverlay 5-step.
  - `QuickOpen/` — Ctrl+P fuzzy file finder.
  - `FindInFiles/` — Ctrl+Shift+F global search.
  - `CreateProjectWizard/` — 5-step new-project flow (F3).
  - `SubagentPanel/` — subagent observation list (ADR-012).

User-facing strings are sourced from `src/renderer/locales/` per NF19
(i18n); no hard-coded English in components. Both `en.json` and
`ru.json` carry 654 keys at parity.

## Public API

Each screen exports a default React component and a named props type.
The screen router lives in `src/renderer/App.tsx` and dispatches
based on the `useNavigation()` Zustand store.

- `screens/<Name>/<Name>.tsx` — default-exports the screen component.
- `components/<Group>/<Component>.tsx` — named-exports each primitive
  plus a typed props interface.
- `[data-screen]` and `[data-testid]` attributes on every routable
  node — Playwright integration tests under `tests/integration/flows/`
  depend on stable selectors.

## Dependencies

Per ADR-001 §3 dep rule #4:

- May import from: `core/domain` (for types referenced in props),
  `core/application` (only the IPC channel contracts, not the use case
  bodies — the renderer cannot execute them directly).
- May NOT import from: `core/adapters/*`, `core/infrastructure`,
  `main/*`.
- External: `react`, `react-dom`, CodeMirror 6 packages, design-system
  primitives.

## Conventions

- Functional components with TypeScript; no class components.
- All async actions go through the IPC client returned by the
  renderer entry — never `electron`/`ipcRenderer` directly in screens.
- All strings via `useTranslation()` — no inline literals.
- CSS modules or vanilla CSS files; stylelint-clean per T-L1-01.

## Tests

Unit tests live under `tests/presentation/{screens,components}/` and
use `@testing-library/react`. Integration flows F1..F11 under
`tests/integration/flows/` exercise the screens through Playwright
`_electron.launch()` against the live Electron + Vite stack.

## References

- ADR-001 §3 dep rule #4 (Presentation isolation)
- ADR-005 (CodeMirror 6 for Markdown viewer)
- ADR-013 (Tokyo Night theme tokens)
- design/ui.md §4 (screen catalog), design/ux.md (F1..F9 flows)
- requirements.md FR11, FR16-FR18, FR21, FR24-FR27, FR31-FR34, FR42,
  FR47, NF19
- docs/user-guide/ — end-user documentation referenced via the
  Welcome F1 shortcut
