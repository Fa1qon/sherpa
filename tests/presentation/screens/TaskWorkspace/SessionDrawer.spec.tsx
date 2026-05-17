import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../../../../src/renderer/locales/en.json';
import { SessionDrawer } from '../../../../src/presentation/screens/TaskWorkspace/SessionDrawer';
import type { AgentMessage } from '../../../../src/core/domain/agent';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

const messages: AgentMessage[] = [
  { id: 'm1', role: 'user', text: 'hello', timestamp: '2026-05-14T00:00:00Z' },
  { id: 'm2', role: 'agent', text: 'hi back', timestamp: '2026-05-14T00:00:01Z' },
  {
    id: 'm3', role: 'tool', text: '', timestamp: '2026-05-14T00:00:02Z',
    toolCall: { name: 'Read', args: { path: '/foo.ts' }, result: 'file content', status: 'success' },
  },
];

function render$(onClose = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SessionDrawer messages={messages} onClose={onClose} />
    </I18nextProvider>,
  );
}

describe('SessionDrawer', () => {
  test('renders all messages including tool details expanded', () => {
    render$();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hi back')).toBeInTheDocument();
    expect(screen.getByText(/Read/)).toBeInTheDocument();
    expect(screen.getByText(/file content/)).toBeInTheDocument();
  });

  test('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render$(onClose);
    fireEvent.click(screen.getByTestId('session-drawer-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render$(onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('does not close when clicking inside drawer', () => {
    const onClose = vi.fn();
    render$(onClose);
    fireEvent.click(screen.getByTestId('session-drawer'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
