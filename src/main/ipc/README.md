# Main / IPC

Typed IPC catalog and handlers — the contract between the Electron main
process and the React renderer. Owned by the main side; the renderer
imports types only.

## Purpose

This module is the single source of truth for every IPC channel name,
its request payload, and its response payload. Both halves of the
bridge — the main-side handlers in `handlers.ts` and the renderer
client in `src/renderer/ipc/client.ts` — derive their signatures from
the `IpcChannels` mapped type defined in `channels.ts`. Adding,
renaming, or changing a channel surfaces as a TypeScript error in every
consumer, which is the structural guarantee behind ADR-001 §Dependency
Rule #4 (Presentation talks to Application via IPC, never via direct
imports).

Phase 1 establishes the minimum surface for the welcome screen and
global settings (`app:*`, `project:list-recent`, `project:open`,
`settings:*`, `theme:*`). Phase 2 adapter tasks and Phase 3 use cases
extend the catalog one channel pair at a time.

## Public API

Re-exported from `index.ts`:

- `IpcChannels` — mapped type whose keys are channel names and whose
  values are `{ request; response }` pairs.
- `IpcChannelName` — `keyof IpcChannels`.
- `IpcRequest<C>` / `IpcResponse<C>` — per-channel payload helpers.
- `IpcResult` — generic write-side envelope (`{ success; error? }`).
- `ProjectOpenResult` — `IpcResult` plus optional `project_id`.
- `AppVersionInfo`, `IpcLocale`, `IpcTheme` — value types referenced by
  the catalog.
- `ALL_CHANNELS` — runtime array of every defined channel name; used by
  the preload bridge and conformance tests.
- `registerIpcHandlers(container)` / `unregisterIpcHandlers()` — bind
  and tear down `ipcMain.handle` registrations against the DI Container.

## Dependencies

- May import from: `electron` (main side only), `core/domain` for value
  types referenced in the catalog (`GlobalSettings`,
  `RecentProjectEntry`).
- May NOT import from: `core/adapters/*`, `core/infrastructure`,
  `presentation`. Handlers receive resolved ports through the
  `Container` argument; they never reach into adapter modules directly.
- Imported by: `src/main/index.ts` (registers handlers on app ready),
  `src/main/preload.ts` (uses `ALL_CHANNELS` to project the typed
  surface onto `window.sherpa`), `src/renderer/ipc/client.ts` (type-only
  import of `IpcChannels`).

## Conventions

- Channel names follow `<context>:<verb>`, lowercase, kebab-case for
  multi-word verbs (e.g. `project:list-recent`).
- `channels.ts` is `import type`-friendly: no runtime Electron imports
  may appear here, otherwise the renderer bundle would pull `electron`.
- Each new channel must (1) define its `{ request; response }` pair in
  `IpcChannels`, (2) append to `ALL_CHANNELS`, (3) register a handler in
  `handlers.ts`, (4) document the contract in `docs/ipc.md`.
- Handlers are thin: they delegate to use cases under
  `core/application/`. No business logic in this folder.
- Errors travel as `IpcResult.error` strings, not thrown exceptions —
  the bridge boundary must stay serialisable.

## References

- ADR-001 §Dependency Rule #4 (Presentation → Application via IPC)
- design/architecture.md §2 (IPC Bridge component)
- design/data.md §4.7 (GlobalSettings) and §4.8 (RecentProjectsList)
- requirements.md FR43 (About / version surface), NF19 (i18n)
- docs/ipc.md (channel-level contract documentation)
