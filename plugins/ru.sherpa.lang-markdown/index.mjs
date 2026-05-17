// Bundled language plugin: Markdown.
// Source: ADR-009 §Bundled MVP-1 plugins; ADR-005 (CodeMirror 6).

import { markdown } from '@codemirror/lang-markdown';

function createLanguagePack() {
  return {
    languageId: 'markdown',
    extension: markdown(),
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
      label: 'Markdown',
      config: { languageId: pack.languageId, extension: pack.extension },
    },
  ];
}

export default createLanguagePack;
