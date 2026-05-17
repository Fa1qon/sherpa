import { create } from 'zustand';
import type { ComponentType } from 'react';

export type PanelSlot = string;

export interface PanelContribution {
  readonly id: string;
  readonly slot: PanelSlot;
  readonly component: ComponentType;
  readonly title?: string;
  readonly priority?: number;
}

interface PanelRegistryState {
  contributions: readonly PanelContribution[];
  register(c: PanelContribution): () => void;
  getSlot(slot: PanelSlot): readonly PanelContribution[];
}

export const usePanelRegistry = create<PanelRegistryState>((set, get) => ({
  contributions: [],

  register: (c) => {
    set((state) => ({
      contributions: state.contributions.some((x) => x.id === c.id)
        ? state.contributions.map((x) => (x.id === c.id ? c : x))
        : [...state.contributions, c],
    }));
    return () => {
      set((state) => ({
        contributions: state.contributions.filter((x) => x.id !== c.id),
      }));
    };
  },

  getSlot: (slot) =>
    get()
      .contributions.filter((c) => c.slot === slot)
      .slice()
      .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50)),
}));

export const panelRegistry = {
  register: (c: PanelContribution) => usePanelRegistry.getState().register(c),
  getSlot: (slot: PanelSlot) => usePanelRegistry.getState().getSlot(slot),
};
