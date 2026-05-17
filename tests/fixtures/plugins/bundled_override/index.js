// AC-T-L5-09-5 fixture — this entry should never be executed because
// B4-SEC rejects the plugin before reaching the import step.
'use strict';

export function initialize(_ctx) {
  throw new Error('bundled_override index.js should never be executed (B4-SEC must reject first)');
}
