// Bundled language plugin: JSON.
// Source: ADR-009 §Bundled MVP-1 plugins; ADR-005 (CodeMirror 6).

import { json } from '@codemirror/lang-json';

function createLanguagePack() {
  return {
    languageId: 'json',
    extension: json(),
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
      label: 'JSON',
      config: { languageId: pack.languageId, extension: pack.extension },
    },
  ];
}

export default createLanguagePack;
