// tests/presentation/extensions/SlotOutlet.spec.tsx
// Extension Framework Plan 04 Task 3 — SlotOutlet rendering tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';

import { SlotOutlet } from '../../../src/presentation/extensions/SlotOutlet';
import {
  useSlotHost,
  registerSlotFromSdk,
} from '../../../src/presentation/extensions/slot_host';

beforeEach(() => {
  useSlotHost.setState({ entries: [] });
});

describe('SlotOutlet', () => {
  it('returns null when no entries are registered for the slot', () => {
    const { container } = render(<SlotOutlet slot="sidebar.panel" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders each registered component for the slot', () => {
    const A = (): ReactElement => <span data-testid="a">A</span>;
    const B = (): ReactElement => <span data-testid="b">B</span>;
    registerSlotFromSdk('ext1', 'a', 'sidebar.panel', A);
    registerSlotFromSdk('ext2', 'b', 'sidebar.panel', B);

    render(<SlotOutlet slot="sidebar.panel" layout="stack" />);
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });

  it('passes props through to each slot component', () => {
    function PropsConsumer(p: Record<string, unknown>): ReactElement {
      return <span data-testid="msg">{String(p.greeting)}</span>;
    }
    registerSlotFromSdk('ext1', 's', 'chat.decorator', PropsConsumer);

    render(<SlotOutlet slot="chat.decorator" props={{ greeting: 'hi' }} />);
    expect(screen.getByTestId('msg').textContent).toBe('hi');
  });

  it('does not render entries from other slots', () => {
    const X = (): ReactElement => <span data-testid="x">X</span>;
    registerSlotFromSdk('ext1', 'x', 'task.toolbar', X);

    const { container } = render(<SlotOutlet slot="sidebar.panel" />);
    expect(container.firstChild).toBeNull();
  });

  it('isolates a crashing entry behind the ExtensionErrorBoundary', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const Bad = (): ReactElement => {
      throw new Error('boom');
    };
    const Good = (): ReactElement => <span data-testid="good">good</span>;
    registerSlotFromSdk('ext.bad', 'b', 'sidebar.panel', Bad);
    registerSlotFromSdk('ext.good', 'g', 'sidebar.panel', Good);

    render(<SlotOutlet slot="sidebar.panel" layout="stack" />);

    // Good component still mounts; bad one shows the boundary's alert UI.
    expect(screen.getByTestId('good')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('ext.bad')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});

afterEach(() => {
  useSlotHost.setState({ entries: [] });
});
