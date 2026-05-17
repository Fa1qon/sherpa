import { describe, it, test, expect, beforeEach } from 'vitest';
import { useNavigation } from '../../../src/renderer/store/navigation';

beforeEach(() => {
  useNavigation.setState({ tabs: [], activeTabId: null });
});

describe('navigation store', () => {
  // Legacy tests updated to use new kinds
  test('initial state — no tabs, no active', () => {
    expect(useNavigation.getState().tabs).toEqual([]);
    expect(useNavigation.getState().activeTabId).toBeNull();
  });

  test('openTab adds tab and makes it active', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'abc' } });
    const s = useNavigation.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.kind).toBe('task');
    expect(s.activeTabId).toBe(s.tabs[0]!.id);
  });

  test('openTab with same kind+id returns existing tab (no duplicate)', () => {
    useNavigation.getState().openTab({ kind: 'settings' });
    const first = useNavigation.getState().tabs[0]!.id;
    useNavigation.getState().openTab({ kind: 'settings' });
    expect(useNavigation.getState().tabs).toHaveLength(1);
    expect(useNavigation.getState().activeTabId).toBe(first);
  });

  test('openTab methodology-editor is singleton — second open returns existing tab', () => {
    useNavigation.getState().openTab({ kind: 'methodology-editor', params: { id: 'a' } });
    const first = useNavigation.getState().tabs[0]!.id;
    useNavigation.getState().openTab({ kind: 'methodology-editor', params: { id: 'b' } });
    expect(useNavigation.getState().tabs).toHaveLength(1);
    expect(useNavigation.getState().activeTabId).toBe(first);
  });

  test('switchTab changes activeTabId', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'a' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    const first = useNavigation.getState().tabs[0]!.id;
    useNavigation.getState().switchTab(first);
    expect(useNavigation.getState().activeTabId).toBe(first);
  });

  test('closeTab removes tab; activeTabId falls back to neighbor', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'a' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    const second = useNavigation.getState().tabs[1]!.id;
    useNavigation.getState().closeTab(second);
    expect(useNavigation.getState().tabs).toHaveLength(1);
    expect(useNavigation.getState().activeTabId).toBe(useNavigation.getState().tabs[0]!.id);
  });

  test('closeTab on last tab leaves activeTabId null', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'only' } });
    const only = useNavigation.getState().tabs[0]!.id;
    useNavigation.getState().closeTab(only);
    expect(useNavigation.getState().tabs).toEqual([]);
    expect(useNavigation.getState().activeTabId).toBeNull();
  });

  test('markDirty / clearDirty toggle the flag', () => {
    useNavigation.getState().openTab({ kind: 'methodology-editor', params: { id: 'a' } });
    const id = useNavigation.getState().tabs[0]!.id;
    useNavigation.getState().markDirty(id, true);
    expect(useNavigation.getState().tabs[0]!.dirty).toBe(true);
    useNavigation.getState().markDirty(id, false);
    expect(useNavigation.getState().tabs[0]!.dirty).toBe(false);
  });

  // New tests from Plan A
  it('task tabs deduplicate by taskId', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'abc' }, title: 'T1' });
    useNavigation.getState().openTab({ kind: 'settings' });
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'abc' }, title: 'T1' });
    expect(useNavigation.getState().tabs).toHaveLength(2);
    expect(useNavigation.getState().activeTabId).toBe(useNavigation.getState().tabs[0].id);
  });

  it('two different taskIds open two tabs', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'a' } });
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'b' } });
    expect(useNavigation.getState().tabs).toHaveLength(2);
  });

  it('settings deduplicates (singleton)', () => {
    useNavigation.getState().openTab({ kind: 'settings' });
    useNavigation.getState().openTab({ kind: 'settings' });
    expect(useNavigation.getState().tabs).toHaveLength(1);
  });

  it('updateTabTitle updates the title of a tab', () => {
    const id = useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'x' }, title: 'Old' });
    useNavigation.getState().updateTabTitle(id, 'New');
    const tab = useNavigation.getState().tabs.find((t) => t.id === id);
    expect(tab?.title).toBe('New');
  });

  it('closeTab activates the nearest remaining tab', () => {
    const a = useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'a' } });
    const b = useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'b' } });
    useNavigation.getState().closeTab(b);
    expect(useNavigation.getState().activeTabId).toBe(a);
  });
});
