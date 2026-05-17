// tests/presentation/screens/TaskWorkspace/ChatThread.translationCollapse.spec.tsx
// Translation collapse was removed in v0.21.2 (Path B): the agent already responds
// in the user's language; the pure adaptForUser() function strips stage tags in
// MasterChatController without emitting a separate system message. All agent
// messages are shown directly without a Show/Hide English toggle.
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../../../../src/renderer/locales/en.json';
import { ChatThread } from '../../../../src/presentation/screens/TaskWorkspace/ChatThread';
import type { AgentMessage } from '../../../../src/core/domain/agent';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

function renderThread(messages: readonly AgentMessage[]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ChatThread messages={messages} />
    </I18nextProvider>,
  );
}

describe('ChatThread — no translation collapse (v0.21.2+)', () => {
  test('agent message always shown directly — no Show English toggle', () => {
    const messages: AgentMessage[] = [
      { id: 'a', role: 'agent', text: 'Long English findings...', timestamp: '2026-05-12T00:00:00Z' },
    ];
    renderThread(messages);

    expect(screen.getByText('Long English findings...')).toBeInTheDocument();
    expect(screen.queryByText('Show English')).not.toBeInTheDocument();
    expect(screen.queryByText('Hide English')).not.toBeInTheDocument();
  });

  test('agent followed by system message: both shown, no collapse toggle', () => {
    const messages: AgentMessage[] = [
      { id: 'a', role: 'agent', text: 'Agent output text.', timestamp: '2026-05-12T00:00:00Z' },
      { id: 's', role: 'system', text: '✓ Gate passed. Advancing to stage `design`.', timestamp: '2026-05-12T00:00:01Z' },
    ];
    renderThread(messages);

    expect(screen.getByText('Agent output text.')).toBeInTheDocument();
    expect(screen.queryByText('Show English')).not.toBeInTheDocument();
  });

  test('system message alone: renders normally', () => {
    const messages: AgentMessage[] = [
      { id: 's', role: 'system', text: 'Gate check — items pending.', timestamp: '2026-05-12T00:00:00Z' },
    ];
    renderThread(messages);

    expect(screen.getByText('Gate check — items pending.')).toBeInTheDocument();
    expect(screen.queryByText('Show English')).not.toBeInTheDocument();
  });

  // Thinking state is handled by WorkingIndicator at the bottom, not in ChatThread.
});
