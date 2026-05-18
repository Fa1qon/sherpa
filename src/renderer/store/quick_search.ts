import { create } from 'zustand';

interface QuickSearchState {
  readonly open: boolean;
  open_(): void;
  close(): void;
  toggle(): void;
}

export const useQuickSearch = create<QuickSearchState>((set, get) => ({
  open: false,
  open_: () => set({ open: true }),
  close: () => set({ open: false }),
  toggle: () => set({ open: !get().open }),
}));
