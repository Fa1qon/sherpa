# Main Process (Electron)

The Electron main process — owns the application lifecycle, the
single Composition Root, IPC handlers, and BrowserWindow management.

## Purpose

This module is the host for everything that needs Node.js privileges or
direct OS access. It is the single entry point of the desktop binary
and the only place where concrete adapters are wired against ports —
per ADR-001 §Compliance §1 the application has exactly one
Composition Root, and it lives here in `composition_root.ts`.

The main process boots the BrowserWindow that renders the React app
(`src/renderer/`), registers IPC handlers under `ipc/` for every use
case the renderer can invoke, and tears down child resources (PTY
sessions, file watchers, vector store handles) on app quit. It also
applies the OS-level menu, tray, deep-link, and auto-updater glue per
FR28-FR30 (Updater) and ADR-002 (UI ↔ Sherpa CLI subprocess).

## Public API

The main process does not export an API to other source modules — it
**is** the host. Externally observable surface (Phase 1):

- `container.ts` — `Container` class (`register` / `resolve` / `has`),
  `token<T>(description)` factory, and `ContainerToken<T>` phantom-typed
  symbol for type-safe DI lookups.
- `composition_root.ts` — `buildContainer()` returns a fully wired
  `Container`; `PORT` namespace exposes the ten port tokens (`PORT.agent`,
  `PORT.storage`, `PORT.embedding`, `PORT.docs`, `PORT.updater`,
  `PORT.sherpaCli`, `PORT.plugin`, `PORT.hook`, `PORT.mcpServer`,
  `PORT.subagentMonitor`).
- `ipc/` — typed channel catalog and handler registration; see
  `src/main/ipc/README.md`. Re-exports `IpcChannels`,
  `registerIpcHandlers`, `unregisterIpcHandlers`, `ALL_CHANNELS`.
- `index.ts` — Electron entry referenced by `package.json#main` (T-L1-08
  scaffolding; window lifecycle filled in subsequent tasks).
- `preload.ts` — contextBridge that projects the typed IPC surface onto
  `window.sherpa`; consumes `ALL_CHANNELS` from `ipc/`.

Subsequent tasks fill remaining stubs (Phase 2 swaps mock adapters for
real ones inside the `PORT.*` registrations; Phase 3 adds use-case
handlers under `ipc/`).

## Dependencies

Per ADR-001 §3 dependency rule (Infrastructure is the only layer that
may import from every other layer):

- May import from: `core/domain`, `core/application`, `core/ports`,
  `core/adapters/*`, `core/infrastructure`.
- Imported by: nothing (this is the process root).
- External runtime: `electron`, Node.js built-ins.

## Conventions

- One file per IPC channel under `ipc/`, named `<feature>.handler.ts`.
- No business logic in handlers — they delegate to use cases under
  `core/application/`.
- All filesystem writes that mutate user state go through `StoragePort`
  (NF14 atomic writes), never raw `fs` here.

## References

- ADR-001 §3.3 (Composition Root), §Compliance §1 (single Composition Root)
- ADR-002 (UI ↔ Sherpa CLI subprocess relation)
- ADR-006 (single-instance lock — see also data.md §11.2)
- ADR-007 (lazy adapter loading; eager wiring of agent/storage/docs)
- design/architecture.md §2 (module table) and §3 (dep rule)
- requirements.md FR28-FR30 (Updater), NF7 (startup budget),
  NF14 (atomic writes)
