import { create } from 'zustand';

export type Activity = 'files' | 'tasks' | 'library' | 'settings';

export interface SideBarState {
  /** Active activity panel; null = collapsed. */
  activity: Activity | null;
  /** Pixel width of the side bar; default 280. */
  width: number;
  setActivity(a: Activity | null): void;
  setWidth(w: number): void;
  /** If `a` is already the active activity, collapse (set null). Otherwise open `a`. */
  toggle(a: Activity): void;
}

export const useSideBar = create<SideBarState>((set, get) => ({
  activity: null,
  width: 280,
  setActivity: (a) => set({ activity: a }),
  setWidth: (w) => set({ width: Math.max(120, Math.min(600, w)) }),
  toggle: (a) => set({ activity: get().activity === a ? null : a }),
}));
