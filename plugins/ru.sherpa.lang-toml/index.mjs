// Bundled language plugin: TOML — STUB.
//
// DEVIATION (T-L2-Plugins-Bundle): @codemirror/lang-toml was not pre-installed
// by master, and the task constraint forbids `npm install`. The plugin
// registers as a `language` capability but returns an empty CodeMirror
// Extension array — i.e. no syntax rules. A follow-up task should swap this
// stub for a real implementation (e.g. `@codemirror/legacy-modes/mode/toml`)
// once dependency lock-in is updated.

function createLanguagePack() {
  return {
    languageId: 'toml',
    // An empty array is a valid CodeMirror Extension (Extension = Extension[] | ...).
    extension: [],
    stub: true,
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
      label: 'TOML (stub)',
      config: { languageId: pack.languageId, extension: pack.extension, stub: true },
    },
  ];
}

export default createLanguagePack;
