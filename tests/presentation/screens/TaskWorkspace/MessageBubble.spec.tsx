import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../../../../src/renderer/locales/en.json';
import { MessageBubble } from '../../../../src/presentation/screens/TaskWorkspace/MessageBubble';
import type { AgentMessage } from '../../../../src/core/domain/agent';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

function makeMessage(overrides: Partial<AgentMessage>): AgentMessage {
  return {
    id: 'msg-1',
    role: 'agent',
    text: '',
    timestamp: '2026-05-12T00:00:00Z',
    ...overrides,
  };
}

function renderBubble(message: AgentMessage) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MessageBubble message={message} />
    </I18nextProvider>,
  );
}

describe('MessageBubble — markdown rendering', () => {
  test('agent role: bold text is rendered as <strong>', () => {
    const message = makeMessage({ role: 'agent', text: 'Some **bold** text' });
    renderBubble(message);
    const strong = document.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('bold');
  });

  test('agent role: triple-backtick code fence renders <pre><code>', () => {
    const message = makeMessage({
      role: 'agent',
      text: '```\nconst x = 1;\n```',
    });
    const { container } = renderBubble(message);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = pre?.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain('const x = 1;');
  });

  test('user role: markdown syntax is rendered as literal text (no <strong>)', () => {
    const message = makeMessage({ role: 'user', text: '**not markdown**' });
    renderBubble(message);
    // Should render as plain text — no <strong> element
    expect(document.querySelector('strong')).toBeNull();
    expect(screen.getByText('**not markdown**')).toBeInTheDocument();
  });

  test('tool role: renders tool-call branch with tool name; no markdown', () => {
    const message = makeMessage({
      role: 'tool',
      text: '',
      toolCall: {
        name: 'Read',
        args: { path: '/foo/bar.txt' },
        result: 'file content here',
        status: 'success',
      },
    });
    const { container } = renderBubble(message);
    // Tool name + primary arg appear in the collapsed summary
    expect(screen.getByText(/Read.*\/foo\/bar\.txt/)).toBeInTheDocument();
    // The tool-call container has data-status attribute
    expect(container.querySelector('[data-status="success"]')).not.toBeNull();
    // No bubble[data-role] wrapper — this is the tool-call branch
    expect(container.querySelector('[data-role]')).toBeNull();
    // Collapsed by default — result is not visible
    expect(screen.queryByText('file content here')).not.toBeInTheDocument();
  });
});
