// Bundled language plugin: YAML.
// Source: ADR-009 §Bundled MVP-1 plugins; ADR-005 (CodeMirror 6).

import { yaml } from '@codemirror/lang-yaml';

function createLanguagePack() {
  return {
    languageId: 'yaml',
    extension: yaml(),
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
      label: 'YAML',
      config: { languageId: pack.languageId, extension: pack.extension },
    },
  ];
}

export default createLanguagePack;
