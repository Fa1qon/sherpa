# Renderer

React application running in the Electron renderer process — the host
for every Sherpa UI Client screen. Bundled by Vite separately from
the main process bundle.

## Purpose

The renderer is the user-visible half of the desktop binary. It mounts
the React tree, wires global providers (theme, i18n), exposes a
navigation store, and routes between screens. It reaches the main
process exclusively through the typed IPC client in `ipc/client.ts`,
which is generated against the catalog in `src/main/ipc/channels.ts`
— per ADR-001 §3 dependency rule #4 the renderer cannot import
`electron`, `core/adapters/*`, `core/infrastructure`, or `main/*`.

Subdirectories:

- `providers/` — React context providers (`ThemeProvider`,
  `I18nProvider`).
- `store/` — Zustand stores (`navigation` ships in T-L1-10).
- `ipc/` — renderer-side IPC client (`client.ts`); calls into
  `window.sherpa` exposed by the preload bridge.
- `locales/` — `ru.json` and `en.json` translation resources (NF19).
- `styles/` — `global.css` and `theme.css`; theme tokens per ADR-013.

## Public API

The renderer is a process-internal module — it is not consumed by
other source modules. The externally observable shape is:

- `App` — top-level React component (default export of `App.tsx`)
  composing `ThemeProvider` → `I18nProvider` → `ScreenRouter`.
- `main.tsx` — Vite entry referenced by `index.html`; mounts `<App />`
  into `#root` via `createRoot`.
- `ipcClient` — `src/renderer/ipc/client.ts`; typed wrapper around
  `window.sherpa` with one method per `IpcChannelName`.
- `useNavigation` — Zustand hook (`store/navigation.ts`) that returns
  the active `Screen` and a `setScreen` setter.

`App.tsx` composes `ThemeProvider` → `I18nProvider` → screen router;
the router resolves the active screen from `useNavigation()` and
dispatches to the components under `src/presentation/`. Global hot-
keys (`Ctrl+P` quick-open, `Ctrl+Shift+F` find-in-files, `Esc` to
dismiss overlays) are wired here. A `window.__sherpa_nav__` debug
hook is installed in development builds (gated by
`import.meta.env.DEV`) so smoke specs can trigger navigation
deterministically.

## Dependencies

Per ADR-001 §3 dependency rule #4:

- May import from: `react`, `react-dom`, `react-i18next`, `i18next`,
  `zustand`, `core/domain` (type-only), `main/ipc/channels` (type-only).
- May NOT import from: `electron`, `core/adapters/*`,
  `core/infrastructure`, `main/*` (other than IPC channel types).
- Imported by: nothing (this is a process root; Vite bundles it
  separately from the main process bundle).

## Conventions

- Functional components only; hooks for side effects.
- All async actions go through `ipcClient` — never `electron` or
  `ipcRenderer` directly.
- All user-facing strings via `useTranslation()` — no inline literals
  (NF19).
- CSS modules or vanilla CSS files; design-token variables defined in
  `styles/theme.css` per ADR-013 (Tokyo Night palette).
- `data-screen` and `data-testid` attributes on every routable node so
  visual regression / Playwright tests can target stable selectors.

## References

- ADR-001 §3 dep rule #4 (Presentation isolation)
- ADR-003 (React 19 selection)
- ADR-013 (Theme tokens / Tokyo Night)
- design/ui.md §1 (visual language) and §4 (screen catalog)
- requirements.md FR42 (Welcome screen), FR44 (theme switch), NF19 (i18n)
