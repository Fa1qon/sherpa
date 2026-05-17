import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useMethodology } from '../../../src/renderer/store/methodology';
import { useProject } from '../../../src/renderer/store/project';
import type { Methodology } from '../../../src/core/domain/methodology';

const SAMPLE: Methodology = {
  id: 'a', version: '1', name: 'A', description: 'a desc',
  stages: [
    { id: 's', name: 's', mode: 'auto', contract: { input: [], output: { path: 's.md' } } },
  ],
  edges: [
    { from: 'start', to: 's', condition: { kind: 'always' } },
    { from: 's', to: 'end', condition: { kind: 'always' } },
  ],
};

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never,
    settings: {} as never,
    methodology: {
      list: vi.fn().mockResolvedValue([
        { id: 'a', version: '1', name: 'A', description: 'a desc', sourcePath: '/p/a.md', warnings: [] },
      ]),
      load: vi.fn().mockResolvedValue({ ok: true, methodology: SAMPLE, warnings: [] }),
      save: vi.fn().mockResolvedValue(undefined),
    },
  };
  useProject.setState({
    current: { id: 'p', name: 'p', path: '/p', addedAt: 'now' },
    recent: [], busy: false, error: null,
  });
  useMethodology.setState({
    list: [], selectedId: null, current: null, loading: false, error: null,
    mode: 'view', draft: null, dirty: false, history: { past: [], future: [] },
  });
});

describe('useMethodology — edit state', () => {
  test('enterEdit clones current into draft, switches mode, clears dirty', () => {
    useMethodology.setState({ current: SAMPLE });
    useMethodology.getState().enterEdit();
    const s = useMethodology.getState();
    expect(s.mode).toBe('edit');
    expect(s.draft).not.toBeNull();
    expect(s.draft).not.toBe(SAMPLE);
    expect(s.draft?.id).toBe('a');
    expect(s.dirty).toBe(false);
  });

  test('exitEdit returns to view, drops draft, drops history', () => {
    useMethodology.setState({ current: SAMPLE });
    useMethodology.getState().enterEdit();
    useMethodology.getState().applyDraft({ ...SAMPLE, name: 'A2' });
    useMethodology.getState().exitEdit();
    const s = useMethodology.getState();
    expect(s.mode).toBe('view');
    expect(s.draft).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.history.past).toHaveLength(0);
  });

  test('applyDraft pushes previous draft into history and sets dirty', () => {
    useMethodology.setState({ current: SAMPLE });
    useMethodology.getState().enterEdit();
    useMethodology.getState().applyDraft({ ...SAMPLE, name: 'A2' });
    const s = useMethodology.getState();
    expect(s.dirty).toBe(true);
    expect(s.draft?.name).toBe('A2');
    expect(s.history.past).toHaveLength(1);
    expect(s.history.past[0]?.name).toBe('A');
  });

  test('undo pops past → current, pushes current → future', () => {
    useMethodology.setState({ current: SAMPLE });
    useMethodology.getState().enterEdit();
    useMethodology.getState().applyDraft({ ...SAMPLE, name: 'A2' });
    useMethodology.getState().undo();
    const s = useMethodology.getState();
    expect(s.draft?.name).toBe('A');
    expect(s.history.future).toHaveLength(1);
    expect(s.history.past).toHaveLength(0);
  });

  test('redo restores undone draft', () => {
    useMethodology.setState({ current: SAMPLE });
    useMethodology.getState().enterEdit();
    useMethodology.getState().applyDraft({ ...SAMPLE, name: 'A2' });
    useMethodology.getState().undo();
    useMethodology.getState().redo();
    expect(useMethodology.getState().draft?.name).toBe('A2');
  });

  test('save calls methodology.save with draft and clears dirty', async () => {
    useMethodology.setState({ current: SAMPLE });
    useMethodology.getState().enterEdit();
    useMethodology.getState().applyDraft({ ...SAMPLE, name: 'A2' });
    await useMethodology.getState().save();
    expect(window.sherpa.methodology.save).toHaveBeenCalledWith('/p', expect.objectContaining({ name: 'A2' }));
    const s = useMethodology.getState();
    expect(s.dirty).toBe(false);
  });

  test('save refuses when not in edit mode (no-op)', async () => {
    useMethodology.setState({ current: SAMPLE });
    await useMethodology.getState().save();
    expect(window.sherpa.methodology.save).not.toHaveBeenCalled();
  });
});
