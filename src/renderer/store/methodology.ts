// src/renderer/store/methodology.ts
import { create } from 'zustand';
import type { Methodology } from '../../core/domain/methodology';
import type { MethodologySummary } from '../../core/ports/methodology_port';
import { useProject } from './project';

export type LibraryMode = 'view' | 'edit';

export interface MethodologyState {
  list: MethodologySummary[];
  selectedId: string | null;
  current: Methodology | null;
  loading: boolean;
  error: string | null;

  mode: LibraryMode;
  draft: Methodology | null;
  dirty: boolean;
  history: { past: Methodology[]; future: Methodology[] };

  refresh(): Promise<void>;
  select(id: string): Promise<void>;

  enterEdit(): void;
  exitEdit(): void;
  applyDraft(next: Methodology): void;
  undo(): void;
  redo(): void;
  save(): Promise<void>;
}

const MAX_HISTORY = 50;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const useMethodology = create<MethodologyState>((set, get) => ({
  list: [],
  selectedId: null,
  current: null,
  loading: false,
  error: null,

  mode: 'view',
  draft: null,
  dirty: false,
  history: { past: [], future: [] },

  refresh: async () => {
    const project = useProject.getState().current;
    if (!project) {
      set({ list: [], selectedId: null, current: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      const list = await window.sherpa.methodology.list(project.path);
      set({ list: [...list], loading: false });
      if (list.length > 0 && get().selectedId === null) {
        await get().select(list[0]!.id);
      }
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  select: async (id: string) => {
    const project = useProject.getState().current;
    if (!project) return;
    set({
      selectedId: id, loading: true, error: null,
      mode: 'view', draft: null, dirty: false, history: { past: [], future: [] },
    });
    const r = await window.sherpa.methodology.load(project.path, id);
    if (r.ok) {
      set({ current: r.methodology, loading: false });
    } else {
      set({
        current: null,
        loading: false,
        error: r.error.kind === 'parse-error' ? r.error.message : r.error.kind,
      });
    }
  },

  enterEdit: () => {
    const cur = get().current;
    if (!cur) return;
    set({
      mode: 'edit',
      draft: clone(cur),
      dirty: false,
      history: { past: [], future: [] },
    });
  },

  exitEdit: () => {
    set({ mode: 'view', draft: null, dirty: false, history: { past: [], future: [] } });
  },

  applyDraft: (next: Methodology) => {
    const cur = get().draft;
    if (!cur) return;
    const past = [...get().history.past, cur].slice(-MAX_HISTORY);
    set({ draft: next, dirty: true, history: { past, future: [] } });
  },

  undo: () => {
    const { past, future } = get().history;
    const cur = get().draft;
    if (past.length === 0 || !cur) return;
    const prev = past[past.length - 1]!;
    set({
      draft: prev,
      history: { past: past.slice(0, -1), future: [cur, ...future] },
      dirty: true,
    });
  },

  redo: () => {
    const { past, future } = get().history;
    const cur = get().draft;
    if (future.length === 0 || !cur) return;
    const next = future[0]!;
    set({
      draft: next,
      history: { past: [...past, cur], future: future.slice(1) },
      dirty: true,
    });
  },

  save: async () => {
    const s = get();
    if (s.mode !== 'edit' || !s.draft) return;
    const project = useProject.getState().current;
    if (!project) return;
    await window.sherpa.methodology.save(project.path, s.draft);
    set({ current: s.draft, dirty: false });
  },
}));
