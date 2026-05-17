// Bundled language plugin: PHP.
// Source: ADR-009 §Bundled MVP-1 plugins; ADR-005 (CodeMirror 6).
// Defaults are used (HTML embedding configurable later via plugin settings).

import { php } from '@codemirror/lang-php';

function createLanguagePack() {
  return {
    languageId: 'php',
    extension: php(),
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
      label: 'PHP',
      config: { languageId: pack.languageId, extension: pack.extension },
    },
  ];
}

export default createLanguagePack;
