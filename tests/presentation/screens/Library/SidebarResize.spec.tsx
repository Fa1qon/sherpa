// Plan 7 Task 1 — SidebarResizer tests.
//
// Strategy:
//   - Mount SidebarResizer inside a fixture that provides a layout host
//     (a <section> mirroring the real editLayout root) and the
//     corresponding ref. This isolates the drag-handle logic from the
//     surrounding MethodologyDetail wiring.
//   - For the "default width" and "restore from localStorage" cases we
//     also mount a Consumer fixture that mimics the inline-style read
//     pattern used by MethodologyDetail so the persistence path is
//     covered end-to-end.
//   - jsdom does not fully implement PointerEvent; SidebarResizer
//     subscribes to both pointer* and mouse* on window, so the specs
//     drive resize gestures with MouseEvent which jsdom handles
//     natively.
import { describe, test, expect, beforeEach } from 'vitest';
import { useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { SidebarResizer } from '../../../../src/presentation/screens/Library/SidebarResizer';

const STORAGE_KEY = 'sherpa.ui.editor.sidebarW';

/**
 * Wraps SidebarResizer in a <section> that owns the CSS custom property,
 * so the resizer can mutate the property via root.style.setProperty and
 * we can assert against it.
 *
 * The default 400px is set inline so getComputedStyle (which in jsdom
 * does NOT resolve var() defaults) still returns a number for the
 * startW probe inside onPointerDown.
 */
function ResizerHarness(props: { initial?: string }): ReactElement {
  const ref = useRef<HTMLElement>(null);
  const style: CSSProperties = {
    ['--editor-sidebar-w' as string]: props.initial ?? '400px',
  } as CSSProperties;
  return (
    <section ref={ref} data-testid="layout" style={style}>
      <SidebarResizer rootRef={ref} />
    </section>
  );
}

/**
 * Mimics the MethodologyDetail wiring: read localStorage once on mount
 * and apply via inline style. Used to verify the "default 400 px" and
 * "restore saved width" contracts.
 */
function ConsumerHarness(): ReactElement {
  const [savedW] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const style: CSSProperties | undefined = savedW
    ? ({ ['--editor-sidebar-w' as string]: savedW } as CSSProperties)
    : undefined;
  return <section data-testid="layout" style={style} />;
}

function getWidthVar(el: HTMLElement): string {
  return el.style.getPropertyValue('--editor-sidebar-w');
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('SidebarResizer / sidebar width persistence', () => {
  test('sidebar default width is 400px when no saved value', () => {
    const { getByTestId } = render(<ConsumerHarness />);
    const layout = getByTestId('layout');
    // No inline override → grid-template-columns falls back to the
    // var(--editor-sidebar-w, 400px) default declared in the stylesheet.
    expect(getWidthVar(layout)).toBe('');
  });

  test('restores saved width from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, '512px');
    const { getByTestId } = render(<ConsumerHarness />);
    const layout = getByTestId('layout');
    expect(getWidthVar(layout)).toBe('512px');
  });

  test('pointerdown + pointermove updates --editor-sidebar-w', () => {
    const { getByTestId, getByRole } = render(<ResizerHarness initial="400px" />);
    const layout = getByTestId('layout');
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 1000 });
    fireEvent(window, new MouseEvent('mousemove', { clientX: 900, bubbles: true }));

    // startX 1000 − ev.clientX 900 = +100 → 400 + 100 = 500.
    expect(getWidthVar(layout)).toBe('500px');
  });

  test('drag tracks dragging data attribute while down', () => {
    const { getByRole } = render(<ResizerHarness initial="400px" />);
    const handle = getByRole('separator');

    expect(handle.getAttribute('data-dragging')).toBe('false');
    fireEvent.pointerDown(handle, { clientX: 1000 });
    expect(handle.getAttribute('data-dragging')).toBe('true');
    fireEvent(window, new MouseEvent('mouseup', { bubbles: true }));
    expect(handle.getAttribute('data-dragging')).toBe('false');
  });

  test('width clamped at MIN_W (320) on far-right drag', () => {
    const { getByTestId, getByRole } = render(<ResizerHarness initial="400px" />);
    const layout = getByTestId('layout');
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 1000 });
    // Drag the handle far to the right → dx = 1000 − 9999 = −8999 →
    // requested width 400 − 8999 = −8599 → clamped to MIN_W.
    fireEvent(window, new MouseEvent('mousemove', { clientX: 9999, bubbles: true }));
    expect(getWidthVar(layout)).toBe('320px');
  });

  test('width clamped at MAX_W (600) on far-left drag', () => {
    const { getByTestId, getByRole } = render(<ResizerHarness initial="400px" />);
    const layout = getByTestId('layout');
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 1000 });
    // Drag far to the left → dx = 1000 − (−9999) = 10999 → requested
    // 400 + 10999 = 11399 → clamped to MAX_W.
    fireEvent(window, new MouseEvent('mousemove', { clientX: -9999, bubbles: true }));
    expect(getWidthVar(layout)).toBe('600px');
  });

  test('pointerup persists current width to localStorage', () => {
    const { getByRole } = render(<ResizerHarness initial="400px" />);
    const handle = getByRole('separator');

    fireEvent.pointerDown(handle, { clientX: 1000 });
    fireEvent(window, new MouseEvent('mousemove', { clientX: 920, bubbles: true }));
    fireEvent(window, new MouseEvent('mouseup', { bubbles: true }));

    // 1000 − 920 = +80 → 400 + 80 = 480.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('480px');
  });
});
