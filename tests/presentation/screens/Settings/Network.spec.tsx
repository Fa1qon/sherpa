import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../../../../src/renderer/locales/en.json';
import { Network } from '../../../../src/presentation/screens/Settings/sections/Network';
import { useSettings } from '../../../../src/renderer/store/settings';

if (!i18n.isInitialized) {
  void i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
}

const updateProxyEntries = vi.fn().mockResolvedValue(undefined);
const updateProxyAssignments = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  useSettings.setState({
    user: {
      theme: 'dark', language: 'en', defaultAgentCli: 'claude',
      costTracking: { enabled: false }, complianceOutputMode: 'off', showEventLog: false,
      proxyEntries: [], proxyAssignments: {
        claudeAgent: 'direct', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct',
      },
    },
    updateProxyEntries,
    updateProxyAssignments,
  } as never);
});

function renderSection() {
  return render(<I18nextProvider i18n={i18n}><Network /></I18nextProvider>);
}

describe('Network settings section', () => {
  test('renders heading', async () => {
    renderSection();
    expect(await screen.findByText(/Network/i)).toBeInTheDocument();
  });

  test('shows empty placeholder when no proxies', () => {
    renderSection();
    expect(screen.getByTestId('proxy-empty')).toBeInTheDocument();
  });

  test('Add Proxy button opens dialog', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByTestId('proxy-add-btn'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('each target shows a Direct option by default', () => {
    renderSection();
    const selects = screen.getAllByRole('combobox');
    for (const s of selects) expect(s).toHaveValue('direct');
  });
});
