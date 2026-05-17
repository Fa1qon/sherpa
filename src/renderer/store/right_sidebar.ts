import { create } from 'zustand';

export interface RightSidebarState {
  isOpen: boolean;
  width: number;
  collapsedSections: ReadonlySet<string>;
  open(): void;
  close(): void;
  toggle(): void;
  setWidth(w: number): void;
  toggleSection(id: string): void;
  setCollapsedSections(ids: string[]): void;
}

export const useRightSidebar = create<RightSidebarState>((set, get) => ({
  isOpen: true,
  width: 260,
  collapsedSections: new Set<string>(),

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set({ isOpen: !get().isOpen }),

  setWidth: (w) => set({ width: Math.max(160, Math.min(500, w)) }),

  toggleSection: (id) => {
    const next = new Set(get().collapsedSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ collapsedSections: next });
  },

  setCollapsedSections: (ids) => set({ collapsedSections: new Set(ids) }),
}));
