// Plan 7 Task 2 — locale parity test.
// Guarantees `en.json` and `ru.json` ship identical key sets so the UI never
// silently falls back to English on a missing translation. Also asserts that
// orphan keys flagged for removal stay removed.
import { describe, test, expect } from 'vitest';
import en from '../../../src/renderer/locales/en.json';
import ru from '../../../src/renderer/locales/ru.json';

function flatten(o: unknown, prefix = ''): Set<string> {
  const out = new Set<string>();
  if (!o || typeof o !== 'object') return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') for (const x of flatten(v, path)) out.add(x);
    else out.add(path);
  }
  return out;
}

describe('locale parity', () => {
  test('en and ru have identical key sets', () => {
    const enKeys = flatten(en);
    const ruKeys = flatten(ru);
    const enOnly = [...enKeys].filter((k) => !ruKeys.has(k));
    const ruOnly = [...ruKeys].filter((k) => !enKeys.has(k));
    expect({ enOnly, ruOnly }).toEqual({ enOnly: [], ruOnly: [] });
  });

  test('no orphan keys from Plan 6 cleanup', () => {
    const keys = flatten(en);
    const orphans = ['library.edit.newDialog.extends', 'library.edit.field.prompt'];
    for (const k of orphans) expect(keys.has(k)).toBe(false);
  });
});
