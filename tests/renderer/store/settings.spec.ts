import { describe, test, expect, vi, beforeEach } from 'vitest';
import { useSettings } from '../../../src/renderer/store/settings';

const defaultCostTracking = {
  showCost: false,
  pricePerMillionInputTokens: 0,
  pricePerMillionOutputTokens: 0,
};

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never,
    settings: {
      getUser: vi.fn().mockResolvedValue({
        theme: 'dark',
        language: 'ru',
        defaultAgentCli: 'claude-code',
        costTracking: defaultCostTracking,
        complianceOutputMode: 'file',
        showEventLog: false,
      }),
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
      costTracking: defaultCostTracking,
      complianceOutputMode: 'file',
      showEventLog: false,
    },
    loaded: false,
  });
});

describe('useSettings', () => {
  test('load fetches from main', async () => {
    await useSettings.getState().load();
    expect(useSettings.getState().user.theme).toBe('dark');
    expect(useSettings.getState().loaded).toBe(true);
  });

  test('setTheme updates store + persists', async () => {
    await useSettings.getState().setTheme('light');
    expect(useSettings.getState().user.theme).toBe('light');
    expect(window.sherpa.settings.setUser).toHaveBeenCalledOnce();
  });

  test('setLanguage updates store + persists', async () => {
    await useSettings.getState().setLanguage('en');
    expect(useSettings.getState().user.language).toBe('en');
    expect(window.sherpa.settings.setUser).toHaveBeenCalled();
  });

  test('setCostTracking updates store + persists', async () => {
    const newCost = { showCost: true, pricePerMillionInputTokens: 3.0, pricePerMillionOutputTokens: 15.0 };
    await useSettings.getState().setCostTracking(newCost);
    expect(useSettings.getState().user.costTracking).toEqual(newCost);
    expect(window.sherpa.settings.setUser).toHaveBeenCalled();
  });

  test('setComplianceOutputMode updates store + persists', async () => {
    await useSettings.getState().setComplianceOutputMode('clipboard');
    expect(useSettings.getState().user.complianceOutputMode).toBe('clipboard');
    expect(window.sherpa.settings.setUser).toHaveBeenCalled();
  });

  test('setShowEventLog updates store + persists', async () => {
    await useSettings.getState().setShowEventLog(true);
    expect(useSettings.getState().user.showEventLog).toBe(true);
    expect(window.sherpa.settings.setUser).toHaveBeenCalled();
  });
});
