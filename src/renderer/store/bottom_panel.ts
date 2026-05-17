import { create } from 'zustand';

export interface BottomPanelState {
  isOpen: boolean;
  height: number;
  toggle(): void;
  setHeight(h: number): void;
}

export const useBottomPanel = create<BottomPanelState>((set, get) => ({
  isOpen: false,
  height: 240,
  toggle: () => set({ isOpen: !get().isOpen }),
  setHeight: (h) => set({ height: Math.max(80, Math.min(600, h)) }),
}));
