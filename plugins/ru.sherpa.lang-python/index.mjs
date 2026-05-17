// Bundled language plugin: Python.
// Source: ADR-009 §Bundled MVP-1 plugins; ADR-005 (CodeMirror 6).

import { python } from '@codemirror/lang-python';

function createLanguagePack() {
  return {
    languageId: 'python',
    extension: python(),
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
      label: 'Python',
      config: { languageId: pack.languageId, extension: pack.extension },
    },
  ];
}

export default createLanguagePack;
