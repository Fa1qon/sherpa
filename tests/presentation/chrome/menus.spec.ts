import { describe, test, expect } from 'vitest';
import { MENUS, allHotkeys } from '../../../src/presentation/chrome/menus';

describe('menus', () => {
  test('has exactly five top menus', () => {
    expect(MENUS).toHaveLength(5);
    expect(MENUS.map((m) => m.id)).toEqual(['project', 'task', 'view', 'tools', 'help']);
  });

  test('every entry has either separator or id+labelKey', () => {
    for (const menu of MENUS) {
      for (const entry of menu.entries) {
        if ('separator' in entry) {
          expect(entry.separator).toBe(true);
        } else {
          expect(entry.id).toBeTruthy();
          expect(entry.labelKey).toBeTruthy();
        }
      }
    }
  });

  test('allHotkeys returns ids that exist somewhere in MENUS', () => {
    const hotkeys = allHotkeys();
    expect(hotkeys.length).toBeGreaterThan(0);
    const allIds = new Set<string>();
    for (const m of MENUS) {
      for (const e of m.entries) {
        if (!('separator' in e)) allIds.add(e.id);
      }
    }
    for (const hk of hotkeys) {
      expect(allIds.has(hk.id)).toBe(true);
    }
  });

  test('Wired items: project.new, project.quit, view.theme, view.language, help.about are NOT disabled', () => {
    // Note: help.docs and help.reportBug were disabled in Plan 3.5 — they had
    // no backing implementation (per user hand-test 2026-05-12). Re-enable
    // them once real handlers (open external URL) exist.
    const flat = MENUS.flatMap((m) => m.entries.filter((e): e is Exclude<typeof e, { separator: true }> => !('separator' in e)));
    const wired = ['project.new', 'project.quit', 'view.theme', 'view.language', 'help.about'];
    for (const id of wired) {
      const item = flat.find((i) => i.id === id);
      expect(item, `expected item ${id} to exist`).toBeDefined();
      expect(item!.disabled, `expected ${id} to be enabled`).not.toBe(true);
    }
  });
});
