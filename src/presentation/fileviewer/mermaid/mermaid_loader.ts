// Singleton lazy loader for the Mermaid library.
//
// Mermaid is heavy (~600 KB gz). It MUST NOT be imported at module top-level
// from any module that participates in the renderer's initial bundle.
// Instead, the dynamic `import('mermaid')` inside `load()` triggers a Vite
// code-split, so mermaid only enters the runtime when the user actually
// opens an .mmd file (Task 3) or a markdown document containing a
// ```mermaid fence (Task 4).
//
// Shape:
//   - `getMermaid()` resolves to the same initialized Mermaid instance for
//     the lifetime of the renderer process.
//   - `setMermaidTheme(theme)` switches the rendering theme. Mermaid does
//     not expose a "set theme on the fly" API, so we re-call `initialize()`
//     on the cached instance. Subsequent `render()` calls observe the new
//     theme.
//   - `_resetForTest()` clears the cache so unit tests can exercise the
//     first-load path repeatedly.
//
// `securityLevel: 'strict'` disables foreign object HTML labels and external
// JavaScript hrefs — important because we render user-supplied diagrams
// from arbitrary files in the workspace.

import type { Mermaid } from 'mermaid';

type MermaidTheme = 'default' | 'dark';

let instance: Promise<Mermaid> | null = null;
let currentTheme: MermaidTheme = 'default';

function mermaidConfig(): Parameters<Mermaid['initialize']>[0] {
  return {
    startOnLoad: false,
    theme: currentTheme,
    securityLevel: 'strict',
    flowchart: { useMaxWidth: true, htmlLabels: false },
    fontFamily: 'inherit',
  };
}

async function load(): Promise<Mermaid> {
  const mod = await import('mermaid');
  const m = mod.default;
  m.initialize(mermaidConfig());
  return m;
}

export function getMermaid(): Promise<Mermaid> {
  if (instance === null) instance = load();
  return instance;
}

export function setMermaidTheme(theme: 'light' | 'dark'): void {
  const mapped: MermaidTheme = theme === 'dark' ? 'dark' : 'default';
  if (mapped === currentTheme) return;
  currentTheme = mapped;
  // Force re-init on the cached instance so the next render() sees the
  // new theme. We deliberately do NOT clear `instance` — re-importing
  // mermaid would duplicate ~600 KB in memory.
  void getMermaid().then((m) => {
    m.initialize(mermaidConfig());
  });
}

/** Test-only: clear the singleton + reset theme so first-load paths can re-run. */
export function _resetForTest(): void {
  instance = null;
  currentTheme = 'default';
}
