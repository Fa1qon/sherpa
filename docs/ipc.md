# IPC Bridge — design + channel catalog

> Status: Phase 1 scaffold (T-L1-09). Channels and shapes are stable;
> handler bodies for `project:*`, `settings:*`, and `theme:*` return
> stubs until the Phase 3 use cases land.
>
> Source of truth for the contract: `src/main/ipc/channels.ts`. This
> document mirrors that file and explains the architectural rules.

## 1. Architecture overview

The Sherpa UI Client is an Electron app split across two processes:

- **Main process** (`src/main/`) — Node-privileged. Owns the
  Composition Root, hosts every adapter (filesystem, sqlite-vec,
  node-pty, etc.), and is the only place that may touch the OS or the
  network.
- **Renderer process** (`src/renderer/`) — Chromium-sandboxed,
  contextIsolation enabled, no Node integration, no remote module.
  Hosts the React UI tree.

Communication between the two flows exclusively through Electron's
`contextBridge` + `ipcRenderer.invoke` / `ipcMain.handle` pair. The
renderer never imports `electron` directly. Instead, the preload
script (`src/main/preload.ts`) projects a typed `window.sherpa` object
into the renderer's global scope, and the renderer obtains a typed
handle via `ipcClient()` (`src/renderer/ipc/client.ts`).

This satisfies ADR-001 dependency rule #4 (Presentation layer must
talk to Application via IPC, never directly) and architecture.md §2
("IPC Bridge component" — single in-memory choke point).

## 2. Security posture

The main entry (`src/main/index.ts`) creates `BrowserWindow` with the
following hardened `webPreferences`:

| Flag                | Value | Why                                                                                                       |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| `contextIsolation`  | true  | Renderer + preload run in separate JS worlds; renderer cannot reach preload internals                     |
| `nodeIntegration`   | false | Renderer has no `require`, no `process`, no Node globals                                                  |
| `sandbox`           | true  | Renderer runs in the Chromium sandbox; even if a renderer bug RCEs, it cannot escalate to OS-level access |
| `preload`           | path  | Preload script that exposes the typed IPC surface via `contextBridge.exposeInMainWorld('sherpa', api)`    |
| `webSecurity`       | true  | Default; same-origin policy enforced                                                                      |

Channels are the **only** way the renderer obtains data from the host
machine. There is no fs/net/cli access in the renderer bundle.

## 3. Channel naming convention

Format: `<context>:<verb>` — lowercase, kebab-case for multi-word
verbs. Examples: `app:ping`, `project:list-recent`, `settings:update`.

Contexts in use (Phase 1): `app`, `project`, `settings`, `theme`.
Phase 2/3/4 add `agent:*`, `task:*`, `kanban:*`, `methodology:*`,
`updater:*`, `plugin:*`, `hook:*`, `mcp:*` as their respective
adapters and use cases land.

Never use `_` in channel names (kebab-case throughout). Never abbreviate
the verb (`get`, not `g`; `list-recent`, not `lst`).

## 4. Phase 1 channel catalog

Nine channels are defined in this scaffold. Each row shows the request
type, the response type, current status, and the future task that
fills the stub.

### 4.1 `app:ping`

- **Request**: `void`
- **Response**: `'pong'`
- **Semantics**: liveness probe. The renderer calls it during smoke
  tests and on launch to confirm the IPC pipe is wired.
- **Status**: full implementation (no adapter dependency).

### 4.2 `app:version`

- **Request**: `void`
- **Response**: `{ version: string; electron: string; node: string }`
- **Semantics**: returns the application version (from `app.getVersion()`)
  alongside the runtime versions of Electron and Node. Surfaces in the
  About dialog (FR43) and diagnostics dump.
- **Status**: full implementation.

### 4.3 `app:locale`

- **Request**: `void`
- **Response**: `'ru' | 'en'`
- **Semantics**: returns the active locale used by the i18n layer
  (NF19). Phase 1 returns the hard-coded fallback `'en'`; Phase 3
  reads `GlobalSettings.language` via the StoragePort adapter.
- **Status**: stub. Filled by Phase 3 settings use case.

### 4.4 `project:list-recent`

- **Request**: `void`
- **Response**: `ReadonlyArray<RecentProjectEntry>` — see
  `src/core/domain/project.ts` for the shape.
- **Semantics**: drives the Welcome screen recent-projects list
  (FR42). Phase 1 returns `[]`; Phase 3 reads
  `~/.sherpa/recent_projects.json` (data.md §4.8) via StoragePort.
- **Status**: stub. Filled by T-L3-A (welcome screen use case).

### 4.5 `project:open`

- **Request**: `{ path: string }` — absolute filesystem path to the
  project root.
- **Response**: `{ success: boolean; project_id?: string; error?: string }`
- **Semantics**: opens a project workspace. Validates the path,
  parses `<path>/.sherpa/settings.yml`, prepends an entry to
  `recent_projects.json`, and emits `ProjectOpened` on the event bus.
- **Status**: stub returning `{ success: false, error: 'not implemented (Phase 3)' }`.
  Filled by T-L3-A / T-L3-B (open project use case).

### 4.6 `settings:get`

- **Request**: `void`
- **Response**: `GlobalSettings` — `~/.sherpa/settings.json` shape
  (data.md §4.7).
- **Semantics**: full snapshot of user-global settings: theme,
  language, update channel, agent binary paths, telemetry invariant.
- **Status**: stub returns a deterministic skeleton matching the
  `GlobalSettings` type. Phase 3 reads via StoragePort.

### 4.7 `settings:update`

- **Request**: `{ patch: Partial<GlobalSettings> }` — RFC-7386-ish
  shallow merge patch.
- **Response**: `{ success: boolean; error?: string }`
- **Semantics**: applies the patch to the persisted settings and
  emits `SettingsUpdated` to all renderer windows. Atomic write per
  ADR-013 (tmp + rename).
- **Status**: stub acknowledges. Phase 3 wires StoragePort + event bus.

### 4.8 `theme:get`

- **Request**: `void`
- **Response**: `'dark' | 'light' | 'system'`
- **Semantics**: current theme selection. `'system'` defers to the OS
  via `nativeTheme`.
- **Status**: stub returns `'system'`. Phase 3 reads from
  `GlobalSettings.theme`.

### 4.9 `theme:set`

- **Request**: `{ theme: 'dark' | 'light' | 'system' }`
- **Response**: `{ success: boolean; error?: string }`
- **Semantics**: persists the theme selection (writes
  `GlobalSettings.theme`) and broadcasts a `ThemeChanged` event. The
  renderer applies CSS variables in response.
- **Status**: stub acknowledges. Phase 3 wires the persistence + event.

## 5. Type-level guarantees

The contract is encoded in a single mapped type:

```ts
export interface IpcChannels {
  'app:ping': { request: void; response: 'pong' };
  'app:version': { request: void; response: AppVersionInfo };
  // ...one entry per channel...
}

export type IpcChannelName = keyof IpcChannels;
export type IpcRequest<C extends IpcChannelName> = IpcChannels[C]['request'];
export type IpcResponse<C extends IpcChannelName> = IpcChannels[C]['response'];

export const ALL_CHANNELS: ReadonlyArray<IpcChannelName> = [
  /* every channel name, exactly once */
] as const;
```

Both the main-side handlers (`src/main/ipc/handlers.ts`) and the
renderer-side wrapper (`src/renderer/ipc/client.ts`) consume this map
via `IpcRequest<C>` / `IpcResponse<C>`. Adding or changing a channel
surfaces as a TypeScript error in every consumer simultaneously — no
silent drift between sides.

The renderer imports `IpcChannelName` / `IpcRequest` / `IpcResponse`
with `import type` only, so the renderer bundle never references
`electron` even though the type module physically lives under
`src/main/`. ADR-001 dependency rule #4 holds because type-only imports
have zero runtime cost (TypeScript compiles them to nothing).

## 6. Adding a new channel

The flow is mechanical:

1. **Define the contract** — open `src/main/ipc/channels.ts` and add
   a new entry to the `IpcChannels` interface. Append the channel
   name to `ALL_CHANNELS`. If the request/response shape uses a new
   payload type, declare it next to the channel and export it via
   the barrel (`src/main/ipc/index.ts`).
2. **Register the handler** — open `src/main/ipc/handlers.ts` and
   add an `ipcMain.handle('<name>', ...)` block. Annotate the return
   type as `Promise<IpcResponse<'<name>'>>` so the compiler enforces
   the contract.
3. **(Optional) Use it from the renderer** — call
   `ipcClient()['<name>'](request)` or `invoke('<name>', request)`
   from `src/renderer/ipc/client.ts`. No edits to `preload.ts` are
   needed; preload picks up the new entry from `ALL_CHANNELS`
   automatically.
4. **Document it** — append a row to §4 above, including the future
   task that fills any stub behaviour.
5. **Test it** — extend `tests/main/ipc/channels.spec.ts` to assert
   the new entry's shape if the request/response is non-trivial.

## 7. Renderer usage

```ts
import { ipcClient, invoke } from '../ipc/client';

// Long form — resolve the api object once, call multiple channels.
const api = ipcClient();
const ping = await api['app:ping']();
const version = await api['app:version']();

// Short form — one-off helper.
const recent = await invoke('project:list-recent');
const result = await invoke('project:open', { path: '/abs/path' });
```

Both forms are fully typed. `api['app:ping']()` returns
`Promise<'pong'>`, not `Promise<unknown>`. Misspelled channel names
fail at compile time.

## 8. Testing strategy

Unit tests for channels.ts live in `tests/main/ipc/channels.spec.ts`
and cover:

- `ALL_CHANNELS` has at least the Phase 1 minimum (≥ 8 entries).
- No duplicate names in `ALL_CHANNELS`.
- Type assertions on a sample of `IpcRequest<...>` / `IpcResponse<...>`.

Integration tests for the renderer client live in
`tests/main/ipc/roundtrip.spec.ts` and cover:

- `ipcClient()` throws when `window.sherpa` is missing (catches
  preload misconfiguration in dev).
- `ipcClient()` returns the stub when a fake `window.sherpa` is
  installed (smoke for the import path).

Full main↔renderer roundtrip tests under a real Electron runtime are
out of scope for Phase 1; Phase 6 adds them via Playwright once the
renderer ships its first usable screen.

## 9. References

- ADR-001 — Architecture Style (Hexagonal-Lite). §Dependency Rule #4
  (Presentation → Application via IPC).
- design/architecture.md §2 — IPC Bridge component overview.
- design/data.md §4.7 — `GlobalSettings` shape.
- design/data.md §4.8 — `RecentProjectsList` shape.
- requirements.md FR42 — recent projects on Welcome.
- requirements.md FR43 — About dialog (uses `app:version`).
- requirements.md FR44 — theme switching (uses `theme:get` / `theme:set`).
- NF19 — locale handling (uses `app:locale`).
