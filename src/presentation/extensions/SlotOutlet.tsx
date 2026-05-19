// src/presentation/extensions/SlotOutlet.tsx
// Extension Framework Plan 04 Task 3 — placeholder that renders every
// extension component currently registered for a given slot. Each entry
// is wrapped in ExtensionErrorBoundary so a single buggy extension
// cannot crash the host UI.

import { type ReactElement } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSlotHost } from './slot_host';
import type { SlotName } from '../../core/domain/extension_manifest';
import { ExtensionErrorBoundary } from './ExtensionErrorBoundary';
import styles from './SlotOutlet.module.css';

interface Props {
  slot: SlotName;
  /** Extra props passed to each slot component. */
  props?: Record<string, unknown>;
  /** Layout direction for multiple entries. */
  layout?: 'inline' | 'stack';
}

export function SlotOutlet({
  slot,
  props = {},
  layout = 'inline',
}: Props): ReactElement | null {
  // useShallow keeps the derived array referentially stable across
  // store updates that do not affect this slot, avoiding an infinite
  // render loop from Zustand's default Object.is equality check.
  const entries = useSlotHost(
    useShallow((s) => s.entries.filter((e) => e.slot === slot)),
  );
  if (entries.length === 0) return null;
  return (
    <div className={layout === 'stack' ? styles.stack : styles.inline}>
      {entries.map((entry) => {
        const Comp = entry.component;
        return (
          <ExtensionErrorBoundary
            key={`${entry.extensionId}:${entry.slotId}`}
            extensionId={entry.extensionId}
            slotId={entry.slotId}
          >
            <Comp {...props} />
          </ExtensionErrorBoundary>
        );
      })}
    </div>
  );
}
