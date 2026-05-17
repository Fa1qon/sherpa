import { create } from 'zustand';

export interface ShellState {
  zenMode: boolean;
  toggleZenMode(): void;
}

export const useShellState = create<ShellState>((set, get) => ({
  zenMode: false,
  toggleZenMode: () => set({ zenMode: !get().zenMode }),
}));
