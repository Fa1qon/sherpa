import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerViewer,
  resolveViewer,
  listViewers,
  clearViewers,
  type ViewerEntry,
} from '../../../src/presentation/fileviewer/viewer_registry';

const stubLoader = async () => ({ Viewer: () => null });

const mkEntry = (overrides: Partial<ViewerEntry> = {}): ViewerEntry => ({
  id: 'test',
  extensions: ['xyz'],
  loadMode: 'text',
  loader: stubLoader,
  displayName: 'Test',
  ...overrides,
});

describe('ViewerRegistry', () => {
  beforeEach(() => clearViewers());

  it('registers a viewer and resolves by extension', () => {
    const entry = mkEntry();
    registerViewer(entry);
    expect(resolveViewer('xyz')).toEqual(entry);
  });

  it('returns null for unknown extension', () => {
    expect(resolveViewer('xxx')).toBeNull();
  });

  it('is case-insensitive on extension lookup', () => {
    registerViewer(mkEntry({ extensions: ['Mmd'] }));
    expect(resolveViewer('MMD')).not.toBeNull();
    expect(resolveViewer('mmd')).not.toBeNull();
  });

  it('listViewers returns all registered', () => {
    registerViewer(mkEntry({ id: 'a', extensions: ['a'] }));
    registerViewer(mkEntry({ id: 'b', extensions: ['b'] }));
    expect(listViewers().map(v => v.id).sort()).toEqual(['a', 'b']);
  });

  it('higher priority wins when two viewers claim same extension', () => {
    registerViewer(mkEntry({ id: 'low', extensions: ['md'], priority: 1 }));
    registerViewer(mkEntry({ id: 'high', extensions: ['md'], priority: 10 }));
    expect(resolveViewer('md')?.id).toBe('high');
  });

  it('rejects duplicate id', () => {
    registerViewer(mkEntry({ id: 'dup' }));
    expect(() => registerViewer(mkEntry({ id: 'dup' })))
      .toThrow(/duplicate/i);
  });

  it('rejects entry without extensions', () => {
    expect(() => registerViewer(mkEntry({ extensions: [] })))
      .toThrow(/extensions/i);
  });
});
