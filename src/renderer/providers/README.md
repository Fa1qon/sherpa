# Renderer / Providers

React context providers used at the top of the renderer tree — theme
resolution and i18next initialisation.

## Purpose

This folder holds the small set of React context providers that every
screen in `presentation/` depends on. Keeping them in one place lets
`App.tsx` compose them in a fixed order
(`ThemeProvider` → `I18nProvider` → `ScreenRouter`) and makes it cheap
to add a new global concern without touching individual screens.

The two providers in MVP-1:

- **ThemeProvider** — resolves `'dark' | 'light' | 'system'` to a
  concrete `'dark' | 'light'` palette, applies the `data-theme`
  attribute on `<html>`, and subscribes to OS preference changes when
  `theme === 'system'`. CSS variables in `styles/theme.css` flip
  automatically when the attribute changes, so the visual swap does not
  require a React re-render.
- **I18nProvider** — initialises `i18next` once (idempotent under HMR),
  registers the `ru` and `en` resource bundles from
  `src/renderer/locales/`, and wraps children in `I18nextProvider`.

## Public API

- `ThemeProvider` — React component; props
  `{ children: ReactNode; initial?: Theme }`. Default `initial` is
  `'system'`.
- `useTheme()` — hook returning
  `{ theme; resolvedTheme; setTheme }`. Throws if invoked outside a
  `ThemeProvider`.
- `Theme` — `'dark' | 'light' | 'system'`.
- `ResolvedTheme` — `'dark' | 'light'`.
- `ThemeContextValue` — type returned by `useTheme()`.
- `I18nProvider` — React component; props `{ children: ReactNode }`.
- `i18next` — re-exported singleton so callers (e.g. tests, locale
  switchers) can read `i18next.language` or call
  `i18next.changeLanguage()` without an extra import.

## Dependencies

Per ADR-001 §3 dep rule #4 (renderer isolation):

- May import from: `react`, `react-i18next`, `i18next`, the JSON files
  under `../locales/`, the CSS in `../styles/theme.css` (indirect, via
  the data-theme attribute contract).
- May NOT import from: `electron`, `core/adapters/*`,
  `core/infrastructure`, `main/*`.
- Imported by: `src/renderer/App.tsx` only. Individual screens consume
  the providers via `useTheme()` and `useTranslation()` hooks, never by
  importing the provider components.

## Conventions

- Providers are pure React — no IPC, no `fs`, no `electron`.
- `i18next.init()` is gated by `!i18next.isInitialized` so HMR reloads
  do not throw; resources are inlined to keep the call synchronous.
- `useTheme` throws on missing context (developer error), unlike
  `useTranslation` which falls back to the key — this asymmetry mirrors
  the safety/UX trade-off of each library.
- New global providers added here MUST keep zero runtime cost when the
  feature is unused (e.g. lazy subscriptions inside `useEffect`).

## References

- ADR-013 (Theme tokens; Tokyo Night palette)
- design/ui.md §1.2 (Tokyo Night derivation)
- requirements.md FR44 (theme switch), NF19 (i18n contract)
- src/renderer/locales/{en,ru}.json (T-L1-11 fills these)
