import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { Settings } from '../../../src/presentation/screens/Settings';
import { useSettings } from '../../../src/renderer/store/settings';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never,
    settings: {
      getUser: vi.fn(),
      setUser: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn(),
      setProject: vi.fn(),
    },
  };
  useSettings.setState({
    user: {
      theme: 'auto',
      language: 'en',
      defaultAgentCli: 'claude-code',
      costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
      complianceOutputMode: 'file',
      showEventLog: false,
    },
    loaded: true,
  });
});

describe('Settings', () => {
  test('renders all six sections in nav', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Settings />
      </I18nextProvider>,
    );
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Cost tracking')).toBeInTheDocument();
    expect(screen.getByText('Compliance review')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  test('switching to Compliance shows all four radio options', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Settings />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Compliance review'));
    expect(screen.getByText('Off (disabled)')).toBeInTheDocument();
    expect(screen.getByText('Write to file')).toBeInTheDocument();
    expect(screen.getByText('Copy to clipboard')).toBeInTheDocument();
    expect(screen.getByText('File and clipboard')).toBeInTheDocument();
  });

  test('clicking a compliance radio option persists the choice', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Settings />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Compliance review'));
    fireEvent.click(screen.getByText('Copy to clipboard'));
    expect(useSettings.getState().user.complianceOutputMode).toBe('clipboard');
  });

  test('switching to Appearance shows theme options', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Settings />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getAllByText('Appearance')[0]!);
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  test('clicking a theme button persists the choice', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Settings />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getAllByText('Appearance')[0]!);
    fireEvent.click(screen.getByText('Dark'));
    expect(useSettings.getState().user.theme).toBe('dark');
  });

  test('switching to Advanced shows showEventLog toggle', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Settings />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByTestId('show-event-log-toggle')).toBeInTheDocument();
    expect(screen.getByText('Show event journal panel')).toBeInTheDocument();
  });

  test('toggling showEventLog in Advanced persists the choice', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Settings />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Advanced'));
    const toggle = screen.getByTestId('show-event-log-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(useSettings.getState().user.showEventLog).toBe(true);
  });
});
