import { create } from 'zustand';
import type { DirEntry } from '../../core/ports/files_port';

export interface FilesState {
  /** Project path the cache belongs to. When null, cache is empty / no project. */
  projectPath: string | null;
  /** Map: relPath → directory entries. Keyed by parent-of-entry relPath. Root is ''. */
  tree: ReadonlyMap<string, readonly DirEntry[]>;
  /** Set of expanded directory relPaths. Root '' is always expanded. */
  expanded: ReadonlySet<string>;
  /** Async fetch errors keyed by relPath. */
  errors: ReadonlyMap<string, string>;
  setProjectPath(p: string | null): void;
  /** Load entries for a directory; idempotent re-loads update the cache. */
  loadDir(relPath: string): Promise<void>;
  /** Expand a directory (loading lazily if not cached), or collapse if already expanded. */
  toggle(relPath: string): Promise<void>;
  /** Reset everything (e.g. on project change). */
  reset(): void;
}

export const useFiles = create<FilesState>((set, get) => ({
  projectPath: null,
  tree: new Map(),
  expanded: new Set(['']),
  errors: new Map(),

  setProjectPath: (p) => {
    // Project switch resets the cache.
    set({ projectPath: p, tree: new Map(), expanded: new Set(['']), errors: new Map() });
  },

  loadDir: async (relPath) => {
    const p = get().projectPath;
    if (p === null) return;
    try {
      const entries = await window.sherpa.files.readDir(p, relPath);
      const tree = new Map(get().tree);
      tree.set(relPath, entries);
      const errors = new Map(get().errors);
      errors.delete(relPath);
      set({ tree, errors });
    } catch (err) {
      const errors = new Map(get().errors);
      errors.set(relPath, (err as Error).message);
      set({ errors });
    }
  },

  toggle: async (relPath) => {
    const expanded = new Set(get().expanded);
    if (expanded.has(relPath)) {
      expanded.delete(relPath);
      set({ expanded });
      return;
    }
    expanded.add(relPath);
    set({ expanded });
    if (!get().tree.has(relPath)) {
      await get().loadDir(relPath);
    }
  },

  reset: () => set({
    projectPath: null, tree: new Map(), expanded: new Set(['']), errors: new Map(),
  }),
}));
