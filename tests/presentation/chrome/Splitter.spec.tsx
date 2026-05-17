import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Splitter } from '../../../src/presentation/chrome/Splitter';

describe('Splitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders a separator div', () => {
    const onResize = vi.fn();
    const { container } = render(<Splitter onResize={onResize} />);
    const el = container.querySelector('[role="separator"]');
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('aria-orientation', 'vertical');
  });

  test('data-dragging is false initially', () => {
    const onResize = vi.fn();
    const { container } = render(<Splitter onResize={onResize} />);
    const el = container.querySelector('[role="separator"]')!;
    expect(el).toHaveAttribute('data-dragging', 'false');
  });

  test('onResize is NOT called before mousedown', () => {
    const onResize = vi.fn();
    render(<Splitter onResize={onResize} />);
    fireEvent.mouseMove(document, { clientX: 200 });
    expect(onResize).not.toHaveBeenCalled();
  });

  test('onResize called with delta on mousemove after mousedown', () => {
    const onResize = vi.fn();
    const { container } = render(<Splitter onResize={onResize} />);
    const el = container.querySelector('[role="separator"]')!;

    fireEvent.mouseDown(el, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 130 });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(30);
  });

  test('multiple mousemove events accumulate separate deltas', () => {
    const onResize = vi.fn();
    const { container } = render(<Splitter onResize={onResize} />);
    const el = container.querySelector('[role="separator"]')!;

    fireEvent.mouseDown(el, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 110 });
    fireEvent.mouseMove(document, { clientX: 120 });

    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenNthCalledWith(1, 10);
    expect(onResize).toHaveBeenNthCalledWith(2, 10);
  });

  test('onResize NOT called after mouseup (drag stopped)', () => {
    const onResize = vi.fn();
    const { container } = render(<Splitter onResize={onResize} />);
    const el = container.querySelector('[role="separator"]')!;

    fireEvent.mouseDown(el, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 110 });
    fireEvent.mouseUp(document);
    onResize.mockClear();

    fireEvent.mouseMove(document, { clientX: 200 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
