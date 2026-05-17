import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useFiles } from '../../../src/renderer/store/files';
import type { DirEntry } from '../../../src/core/ports/files_port';

const readDirMock = vi.fn();

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    files: { readDir: readDirMock, readFile: vi.fn() },
  };
  readDirMock.mockReset();

  // Reset store to initial state
  useFiles.setState({
    projectPath: null,
    tree: new Map(),
    expanded: new Set(['']),
    errors: new Map(),
  });
});

function makeEntries(...names: string[]): DirEntry[] {
  return names.map((name) => ({ name, relPath: name, kind: 'file' as const }));
}

describe('useFiles', () => {
  test('1. initial: projectPath null, tree empty, expanded contains "" only', () => {
    const s = useFiles.getState();
    expect(s.projectPath).toBeNull();
    expect(s.tree.size).toBe(0);
    expect(s.expanded.has('')).toBe(true);
    expect(s.expanded.size).toBe(1);
  });

  test('2. setProjectPath("/p") sets projectPath and resets cache', () => {
    // Pre-populate some state
    useFiles.setState({
      projectPath: '/old',
      tree: new Map([['src', makeEntries('a.ts')]]),
      expanded: new Set(['', 'src']),
      errors: new Map([['src', 'oops']]),
    });

    useFiles.getState().setProjectPath('/p');

    const s = useFiles.getState();
    expect(s.projectPath).toBe('/p');
    expect(s.tree.size).toBe(0);
    expect(s.expanded.has('')).toBe(true);
    expect(s.expanded.size).toBe(1);
    expect(s.errors.size).toBe(0);
  });

  test('3. loadDir("") calls readDir("/p", "") and caches result', async () => {
    const entries = makeEntries('src', 'package.json');
    readDirMock.mockResolvedValueOnce(entries);
    useFiles.setState({ projectPath: '/p' });

    await useFiles.getState().loadDir('');

    expect(readDirMock).toHaveBeenCalledWith('/p', '');
    const s = useFiles.getState();
    expect(s.tree.get('')).toEqual(entries);
    expect(s.errors.size).toBe(0);
  });

  test('4. loadDir error path: readDir rejects → errors map gets relPath → message', async () => {
    readDirMock.mockRejectedValueOnce(new Error('permission denied'));
    useFiles.setState({ projectPath: '/p' });

    await useFiles.getState().loadDir('secret');

    const s = useFiles.getState();
    expect(s.errors.get('secret')).toBe('permission denied');
    expect(s.tree.has('secret')).toBe(false);
  });

  test('5. loadDir successful retry after error: errors cleared, tree set', async () => {
    useFiles.setState({
      projectPath: '/p',
      errors: new Map([['src', 'old error']]),
      tree: new Map(),
      expanded: new Set(['']),
    });
    const entries = makeEntries('index.ts');
    readDirMock.mockResolvedValueOnce(entries);

    await useFiles.getState().loadDir('src');

    const s = useFiles.getState();
    expect(s.errors.has('src')).toBe(false);
    expect(s.tree.get('src')).toEqual(entries);
  });

  test('6. toggle("src"): if not expanded, calls loadDir → readDir once, adds to expanded', async () => {
    const entries = makeEntries('index.ts');
    readDirMock.mockResolvedValueOnce(entries);
    useFiles.setState({ projectPath: '/p' });

    await useFiles.getState().toggle('src');

    expect(readDirMock).toHaveBeenCalledTimes(1);
    expect(readDirMock).toHaveBeenCalledWith('/p', 'src');
    const s = useFiles.getState();
    expect(s.expanded.has('src')).toBe(true);
    expect(s.tree.get('src')).toEqual(entries);
  });

  test('7. toggle("src") second time: removes from expanded, does NOT re-call readDir', async () => {
    const entries = makeEntries('index.ts');
    readDirMock.mockResolvedValueOnce(entries);
    useFiles.setState({ projectPath: '/p' });

    // First toggle: expand and load
    await useFiles.getState().toggle('src');
    expect(readDirMock).toHaveBeenCalledTimes(1);

    // Second toggle: collapse
    await useFiles.getState().toggle('src');

    expect(readDirMock).toHaveBeenCalledTimes(1); // no extra call
    expect(useFiles.getState().expanded.has('src')).toBe(false);
  });

  test('8. toggle does NOT re-loadDir if tree already has the key (collapse then re-expand)', async () => {
    const entries = makeEntries('index.ts');
    readDirMock.mockResolvedValueOnce(entries);
    useFiles.setState({ projectPath: '/p' });

    // Expand (loads)
    await useFiles.getState().toggle('src');
    // Collapse
    await useFiles.getState().toggle('src');
    // Re-expand — tree already cached, should not call readDir again
    await useFiles.getState().toggle('src');

    expect(readDirMock).toHaveBeenCalledTimes(1);
    expect(useFiles.getState().expanded.has('src')).toBe(true);
    expect(useFiles.getState().tree.get('src')).toEqual(entries);
  });

  test('9. setProjectPath resets tree + expanded back to base', async () => {
    const entries = makeEntries('a.ts');
    readDirMock.mockResolvedValue(entries);
    useFiles.setState({ projectPath: '/p' });
    await useFiles.getState().toggle('src');

    // Now switch project
    useFiles.getState().setProjectPath('/other');

    const s = useFiles.getState();
    expect(s.projectPath).toBe('/other');
    expect(s.tree.size).toBe(0);
    expect([...s.expanded]).toEqual(['']);
  });

  test('10. reset() clears everything', async () => {
    const entries = makeEntries('a.ts');
    readDirMock.mockResolvedValue(entries);
    useFiles.setState({ projectPath: '/p' });
    await useFiles.getState().loadDir('');
    await useFiles.getState().toggle('src');

    useFiles.getState().reset();

    const s = useFiles.getState();
    expect(s.projectPath).toBeNull();
    expect(s.tree.size).toBe(0);
    expect([...s.expanded]).toEqual(['']);
    expect(s.errors.size).toBe(0);
  });
});
