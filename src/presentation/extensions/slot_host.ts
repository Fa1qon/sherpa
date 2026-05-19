// src/presentation/extensions/slot_host.ts
// Extension Framework Plan 04 Task 1 — Zustand store for renderer-side
// slot registrations. Host UI subscribes via <SlotOutlet>; the renderer
// SDK calls registerSlotFromSdk through the global __sherpaSlots shim
// (see Plan 03 createRendererSdk.slotRegistration).

import { create } from 'zustand';
import type { ComponentType } from 'react';
import type { SlotName } from '../../core/domain/extension_manifest';

export interface SlotEntry {
  extensionId: string;
  slotId: string; // matches manifest.slots[].id
  slot: SlotName;
  title?: string;
  icon?: string;
  component: ComponentType<Record<string, unknown>>;
}

interface SlotHostState {
  entries: SlotEntry[];
  register: (entry: SlotEntry) => void;
  unregisterByExtension: (extensionId: string) => void;
  listBySlot: (slot: SlotName) => SlotEntry[];
}

export const useSlotHost = create<SlotHostState>((set, get) => ({
  entries: [],
  register: (entry) =>
    set((s) => ({ entries: [...s.entries, entry] })),
  unregisterByExtension: (id) =>
    set((s) => ({ entries: s.entries.filter((e) => e.extensionId !== id) })),
  listBySlot: (slot) => get().entries.filter((e) => e.slot === slot),
}));

// Imperative helpers exposed to the renderer SDK (Plan 03).
export function registerSlotFromSdk(
  extensionId: string,
  slotId: string,
  slot: SlotName,
  component: ComponentType<Record<string, unknown>>,
): void {
  useSlotHost.getState().register({ extensionId, slotId, slot, component });
}

export function unregisterAllForExtension(extensionId: string): void {
  useSlotHost.getState().unregisterByExtension(extensionId);
}

// Expose to the renderer SDK via a global shim. Plan 03's
// `createRendererSdk` accepts a `slotRegistration` callback; the host
// wiring will pull these handlers off `window.__sherpaSlots`.
if (typeof window !== 'undefined') {
  (window as unknown as { __sherpaSlots?: unknown }).__sherpaSlots = {
    register: registerSlotFromSdk,
    unregister: unregisterAllForExtension,
  };
}
