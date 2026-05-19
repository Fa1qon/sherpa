// src/main/services/extension_slot_registry.ts
// Extension Framework Plan 03 Task 4 — main-process registry for UI slot
// contributions declared by extensions.
//
// The renderer reads this via IPC (Plan 04) and mounts components into
// matching `<ExtensionSlot name="..." />` mount points. We keep the
// registry main-side so it survives renderer reloads and so the loader
// (Plan 05) can populate it deterministically when an extension activates.

import type {
  SlotName,
  ExtensionSlotRegistration,
} from '../../core/domain/extension_manifest';

export interface RegisteredSlot extends ExtensionSlotRegistration {
  extensionId: string;
  /** Path (relative to the extension dir) of the renderer component. */
  componentPath?: string;
}

export class ExtensionSlotRegistry {
  /** slot name -> list of registrations. */
  private readonly slots = new Map<SlotName, RegisteredSlot[]>();

  register(
    extensionId: string,
    reg: ExtensionSlotRegistration,
    componentPath?: string,
  ): void {
    const list = this.slots.get(reg.slot) ?? [];
    list.push({ ...reg, extensionId, componentPath });
    this.slots.set(reg.slot, list);
  }

  /**
   * Remove every slot contributed by `extensionId`. Returns the total
   * number of registrations removed.
   */
  unregister(extensionId: string): number {
    let removed = 0;
    for (const [slot, list] of this.slots) {
      const filtered = list.filter((r) => r.extensionId !== extensionId);
      removed += list.length - filtered.length;
      if (filtered.length === 0) this.slots.delete(slot);
      else this.slots.set(slot, filtered);
    }
    return removed;
  }

  listFor(slot: SlotName): RegisteredSlot[] {
    return this.slots.get(slot) ?? [];
  }

  /** Snapshot of every slot map entry (used by renderer IPC). */
  all(): Record<string, RegisteredSlot[]> {
    return Object.fromEntries(this.slots);
  }
}
