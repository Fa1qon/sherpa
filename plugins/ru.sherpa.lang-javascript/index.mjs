// Bundled language plugin: JavaScript.
// Source: ADR-009 §Bundled MVP-1 plugins; ADR-005 (CodeMirror 6).
// Implementation: @codemirror/lang-javascript (default JS dialect).

import { javascript } from '@codemirror/lang-javascript';

function createLanguagePack() {
  return {
    languageId: 'javascript',
    extension: javascript(),
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
      label: 'JavaScript',
      config: { languageId: pack.languageId, extension: pack.extension },
    },
  ];
}

export default createLanguagePack;
