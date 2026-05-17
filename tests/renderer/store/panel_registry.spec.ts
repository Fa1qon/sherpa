import { describe, it, expect, beforeEach } from 'vitest';
import { usePanelRegistry } from '../../../src/renderer/store/panel_registry';
import type { PanelContribution } from '../../../src/renderer/store/panel_registry';

const stub = (): null => null;

function makeContrib(overrides: Partial<PanelContribution> = {}): PanelContribution {
  return { id: 'test', slot: 'sidebar.right:task', component: stub, priority: 10, ...overrides };
}

beforeEach(() => {
  usePanelRegistry.setState({ contributions: [] });
});

describe('PanelRegistry', () => {
  it('registers a contribution and makes it visible in getSlot', () => {
    usePanelRegistry.getState().register(makeContrib());
    const results = usePanelRegistry.getState().getSlot('sidebar.right:task');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test');
  });

  it('unregister function removes contribution', () => {
    const unregister = usePanelRegistry.getState().register(makeContrib());
    unregister();
    expect(usePanelRegistry.getState().getSlot('sidebar.right:task')).toHaveLength(0);
  });

  it('getSlot returns only contributions for the requested slot', () => {
    usePanelRegistry.getState().register(makeContrib({ id: 'a', slot: 'sidebar.right:task' }));
    usePanelRegistry.getState().register(makeContrib({ id: 'b', slot: 'statusbar.left' }));
    expect(usePanelRegistry.getState().getSlot('sidebar.right:task')).toHaveLength(1);
    expect(usePanelRegistry.getState().getSlot('statusbar.left')).toHaveLength(1);
  });

  it('getSlot sorts by priority ascending', () => {
    usePanelRegistry.getState().register(makeContrib({ id: 'z', priority: 30 }));
    usePanelRegistry.getState().register(makeContrib({ id: 'a', priority: 10 }));
    usePanelRegistry.getState().register(makeContrib({ id: 'm', priority: 20 }));
    const ids = usePanelRegistry.getState().getSlot('sidebar.right:task').map((c) => c.id);
    expect(ids).toEqual(['a', 'm', 'z']);
  });

  it('duplicate id registration replaces the existing contribution', () => {
    usePanelRegistry.getState().register(makeContrib({ id: 'x', priority: 10 }));
    usePanelRegistry.getState().register(makeContrib({ id: 'x', priority: 99 }));
    const slot = usePanelRegistry.getState().getSlot('sidebar.right:task');
    expect(slot).toHaveLength(1);
    expect(slot[0].priority).toBe(99);
  });
});
