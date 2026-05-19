// tests/presentation/extensions/ExtensionErrorBoundary.spec.tsx
// Extension Framework Plan 04 Task 2 — error boundary tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { ExtensionErrorBoundary } from '../../../src/presentation/extensions/ExtensionErrorBoundary';

function Throws({ when }: { when: boolean }): ReactElement {
  if (when) throw new Error('boom');
  return <span data-testid="ok">ok</span>;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('ExtensionErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ExtensionErrorBoundary extensionId="ext.x" slotId="s1">
        <Throws when={false} />
      </ExtensionErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    render(
      <ExtensionErrorBoundary extensionId="ext.x" slotId="s1">
        <Throws when={true} />
      </ExtensionErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/crashed/)).toBeInTheDocument();
    expect(screen.getByText('ext.x')).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('retry clears error and re-renders child', () => {
    function Harness(): ReactElement {
      const [throws, setThrows] = useState(true);
      return (
        <>
          <button type="button" data-testid="fix" onClick={() => setThrows(false)}>
            fix
          </button>
          <ExtensionErrorBoundary extensionId="ext.x" slotId="s1">
            <Throws when={throws} />
          </ExtensionErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // First fix the underlying state so the child no longer throws,
    // then click retry to reset the boundary.
    fireEvent.click(screen.getByTestId('fix'));
    fireEvent.click(screen.getByText('retry'));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });
});
