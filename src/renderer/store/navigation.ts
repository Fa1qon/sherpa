import { create } from 'zustand';

export type TabKind = 'task' | 'methodology-editor' | 'settings' | 'project-settings' | 'file' | 'tracker' | 'browser' | 'analytics';

export interface Tab {
  readonly id: string;
  readonly kind: TabKind;
  readonly params?: Record<string, string>;
  readonly title?: string;
  readonly dirty?: boolean;
}

export interface OpenTabRequest {
  readonly kind: TabKind;
  readonly params?: Record<string, string>;
  readonly title?: string;
}

export interface NavigationState {
  tabs: Tab[];
  activeTabId: string | null;
  openTab(req: OpenTabRequest): string;
  switchTab(id: string): void;
  closeTab(id: string): void;
  markDirty(id: string, dirty: boolean): void;
  updateTabTitle(id: string, title: string): void;
  updateTabParams(id: string, params: Record<string, string>): void;
  reorderTabs(fromIndex: number, toIndex: number): void;
}

function tabKey(req: OpenTabRequest): string {
  if (req.kind === 'task' && req.params?.taskId) return `task:${req.params.taskId}`;
  if (req.kind === 'file' && req.params?.relPath) return `file:${req.params.relPath}`;
  if (req.kind === 'browser' && req.params?.url) return `browser:${req.params.url}`;
  return req.kind;
}

function makeTabId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useNavigation = create<NavigationState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (req) => {
    const key = tabKey(req);
    const existing = get().tabs.find(
      (t) => tabKey({ kind: t.kind, params: t.params }) === key,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const tab: Tab = {
      id: makeTabId(),
      kind: req.kind,
      ...(req.params && { params: req.params }),
      ...(req.title && { title: req.title }),
    };
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id });
    return tab.id;
  },

  switchTab: (id) => {
    if (get().tabs.some((t) => t.id === id)) set({ activeTabId: id });
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = tabs.filter((t) => t.id !== id);
    let nextActive = activeTabId;
    if (activeTabId === id) {
      nextActive = next[Math.min(idx, next.length - 1)]?.id ?? null;
    }
    set({ tabs: next, activeTabId: nextActive });
  },

  markDirty: (id, dirty) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, dirty } : t)) });
  },

  updateTabTitle: (id, title) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, title } : t)) });
  },

  updateTabParams: (id, params) => {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, params } : t)) });
  },

  reorderTabs: (fromIndex, toIndex) => {
    const tabs = [...get().tabs];
    if (fromIndex < 0 || fromIndex >= tabs.length) return;
    const [moved] = tabs.splice(fromIndex, 1);
    tabs.splice(Math.min(toIndex, tabs.length), 0, moved!);
    set({ tabs });
  },
}));
