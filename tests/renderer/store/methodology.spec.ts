import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useMethodology } from '../../../src/renderer/store/methodology';
import { useProject } from '../../../src/renderer/store/project';

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never,
    settings: {} as never,
    methodology: {
      list: vi.fn().mockResolvedValue([
        { id: 'a', version: '1', name: 'A', description: 'a', sourcePath: '/p/a.md', warnings: [] },
      ]),
      load: vi.fn().mockResolvedValue({
        ok: true,
        methodology: {
          id: 'a', version: '1', name: 'A', description: 'a',
          stages: [{ id: 's', name: 'S', mode: 'auto', contract: { input: [], output: { path: 's.md' } } }],
          edges: [],
        },
        warnings: [],
      }),
      save: vi.fn(),
    },
  };
  useProject.setState({
    current: { id: 'p', name: 'p', path: '/p', addedAt: 'now' },
    recent: [],
    busy: false,
    error: null,
  });
  useMethodology.setState({ list: [], selectedId: null, current: null, loading: false, error: null });
});

describe('useMethodology', () => {
  test('refresh populates list + auto-selects first', async () => {
    await useMethodology.getState().refresh();
    expect(useMethodology.getState().list).toHaveLength(1);
    expect(useMethodology.getState().selectedId).toBe('a');
    expect(useMethodology.getState().current).not.toBeNull();
  });

  test('refresh clears when no project', async () => {
    useProject.setState({ current: null, recent: [], busy: false, error: null });
    await useMethodology.getState().refresh();
    expect(useMethodology.getState().list).toEqual([]);
    expect(useMethodology.getState().current).toBeNull();
  });
});
