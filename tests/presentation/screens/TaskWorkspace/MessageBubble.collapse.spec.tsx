import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function wrap(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

const toolMsg = (): AgentMessage => ({
  id: 'm1',
  role: 'tool',
  text: '',
  toolCall: {
    name: 'Read',
    args: { file_path: 'src/foo.ts' },
    result: 'line 1\nline 2\nline 3',
    status: 'success',
  },
  timestamp: '2026-05-12T00:00:00Z',
});

describe('ToolCallBubble', () => {
  test('renders collapsed by default; shows summary only', () => {
    wrap(<MessageBubble message={toolMsg()} />);
    expect(screen.getByText(/Read.*src\/foo\.ts/)).toBeInTheDocument();
    expect(screen.queryByText(/line 1/)).not.toBeInTheDocument();
  });

  test('clicking summary expands args + result', () => {
    wrap(<MessageBubble message={toolMsg()} />);
    fireEvent.click(screen.getByRole('button'));
    // Multi-line result content
    expect(screen.getByText(/line 1/)).toBeInTheDocument();
    expect(screen.getByText(/file_path/)).toBeInTheDocument();
  });

  test('aria-expanded toggles', () => {
    wrap(<MessageBubble message={toolMsg()} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});
