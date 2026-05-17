// Bundled language plugin: TypeScript.
// Source: ADR-009 §Bundled MVP-1 plugins; ADR-005 (CodeMirror 6).
// Implementation: @codemirror/lang-javascript with `{ typescript: true }`.
//
// Exports:
//   - default(): the language factory (AC-4) — returns
//       { languageId: 'typescript', extension: <CodeMirror Extension> }.
//   - initialize(ctx): no-op resolved Promise (ADR-009 §FR-P2).
//   - capabilities(): CapabilityDescriptor[] for the PluginLoader registry —
//       carries the language extension under `config.extension`.

import { javascript } from '@codemirror/lang-javascript';

function createLanguagePack() {
  return {
    languageId: 'typescript',
    extension: javascript({ typescript: true }),
  };
}

export function initialize(_ctx) {
  return Promise.resolve();
}

export function capabilities() {
  const pack = createLanguagePack();
  return [
    {
      kind: 'language',
      label: 'TypeScript',
      config: { languageId: pack.languageId, extension: pack.extension },
    },
  ];
}

export default createLanguagePack;
