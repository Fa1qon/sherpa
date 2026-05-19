// src/presentation/extensions/ExtensionErrorBoundary.tsx
// Extension Framework Plan 04 Task 2 — error boundary isolates an
// extension component crash from the host UI. Each <SlotOutlet> wraps
// every registered entry in this boundary so a single buggy extension
// cannot bring down the workspace.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  extensionId: string;
  slotId: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ExtensionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(
      `Extension "${this.props.extensionId}" crashed in slot "${this.props.slotId}":`,
      error,
      info,
    );
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            margin: '4px',
            border: '1px solid var(--error)',
            borderRadius: '4px',
            color: 'var(--error)',
            fontSize: '11px',
            background: 'rgba(231, 76, 60, 0.08)',
          }}
        >
          Extension <strong>{this.props.extensionId}</strong> crashed.
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{ marginLeft: '8px', cursor: 'pointer' }}
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
