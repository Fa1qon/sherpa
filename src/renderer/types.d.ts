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

// @nteract/notebook-render@4.0.3 ships only flow types — no .d.ts.
// We only consume the default export (a React.PureComponent subclass)
// with the `notebook` prop, so a narrow shim is sufficient. See
// src/presentation/fileviewer/JupyterViewer.tsx for the only consumer.
declare module '@nteract/notebook-render' {
  import type { ComponentType } from 'react';
  interface NotebookRenderProps {
    notebook: unknown;
    theme?: 'light' | 'dark';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayOrder?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transforms?: any;
  }
  const NotebookRender: ComponentType<NotebookRenderProps>;
  export default NotebookRender;
}

// Typed bridge surface — keep in sync with src/main/preload.ts.
// Using an `import(...)` type expression rather than a top-level `import`
// preserves the file's script (non-module) status; see header note.
interface Window {
  readonly sherpa: import('../main/preload').SherpaApi;
}

// Electron <webview> tag — Electron exposes this as an HTMLElement subclass
// (Electron.WebviewTag). Declaring it in JSX.IntrinsicElements lets React
// type-check `<webview src=... ref=...>` correctly without `as any`.
declare namespace JSX {
  interface IntrinsicElements {
    webview: import('react').DetailedHTMLProps<
      import('react').HTMLAttributes<HTMLElement> & {
        src?: string;
        allowpopups?: string | boolean;
        partition?: string;
        useragent?: string;
        nodeintegration?: string | boolean;
        webpreferences?: string;
        httpreferrer?: string;
        disablewebsecurity?: string | boolean;
        preload?: string;
      },
      HTMLElement
    >;
  }
}
