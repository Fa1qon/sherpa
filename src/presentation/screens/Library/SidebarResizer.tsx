// src/presentation/screens/Library/SidebarResizer.tsx
// Plan 7 Task 1 — drag-handle that resizes the editor sidebar by writing
// the --editor-sidebar-w CSS custom property on the layout root element.
// Width is clamped between MIN_W and MAX_W and persisted to localStorage
// on pointerup so it survives reloads.
import { useCallback, useState, type ReactElement, type RefObject } from 'react';
import styles from './Library.module.css';

const MIN_W = 320;
const MAX_W = 600;
const STORAGE_KEY = 'sherpa.ui.editor.sidebarW';

interface Props {
  readonly rootRef: RefObject<HTMLElement | null>;
}

export function SidebarResizer({ rootRef }: Props): ReactElement {
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const root = rootRef.current;
      if (!root) return;
      setDragging(true);
      const startX = e.clientX;
      const startW =
        parseFloat(getComputedStyle(root).getPropertyValue('--editor-sidebar-w')) || 400;

      const onMove = (ev: PointerEvent | MouseEvent): void => {
        const dx = startX - ev.clientX;
        const next = Math.min(MAX_W, Math.max(MIN_W, startW + dx));
        root.style.setProperty('--editor-sidebar-w', `${next}px`);
      };
      const onUp = (): void => {
        setDragging(false);
        const w = root.style.getPropertyValue('--editor-sidebar-w');
        if (w) {
          try {
            localStorage.setItem(STORAGE_KEY, w);
          } catch {
            // localStorage unavailable — silently ignore.
          }
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      // jsdom does not implement PointerEvent fully; also subscribe to
      // mouse* events so unit tests can drive the handler with synthetic
      // MouseEvents while real browsers continue to use pointer events.
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [rootRef],
  );

  return (
    <div
      className={styles.sidebarResizer}
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    />
  );
}
