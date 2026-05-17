// src/renderer/types.d.ts
// Ambient module declarations + window.sherpa typing for the renderer.
//
// IMPORTANT: This file must remain a SCRIPT (no top-level `import` / `export`)
// so the wildcard `declare module '*.css'` shims register as AMBIENT module
// declarations, not module augmentations. The cross-reference to the
// preload-exposed SherpaApi uses an `import(...)` type expression — that
// form is valid at type position and does NOT turn the file into a module.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const content: string;
  export default content;
}

// Vite ?url suffix — imports the asset as a resolved URL string at runtime.
// This covers SVGs and other static assets imported with the ?url query param.
declare module '*.svg?url' {
  const url: string;
  export default url;
}

// cytoscape-fcose ships JS with no type declarations. We only consume
// the default export (a layout extension function passed to
// cytoscape.use()), so an `any`-typed module shim is sufficient. See
// src/presentation/screens/Graph/GraphView.tsx for the only consumer.
declare module 'cytoscape-fcose' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fcose: any;
  export default fcose;
}

// Typed bridge surface — keep in sync with src/main/preload.ts.
// Using an `import(...)` type expression rather than a top-level `import`
// preserves the file's script (non-module) status; see header note.
interface Window {
  readonly sherpa: import('../main/preload').SherpaApi;
}
