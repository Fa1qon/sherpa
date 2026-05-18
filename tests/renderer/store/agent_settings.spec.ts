import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockAgent = {
  storeKey: vi.fn().mockResolvedValue({ ok: true }),
  revoke: vi.fn().mockResolvedValue({ ok: true }),
  authStatus: vi.fn().mockResolvedValue({ hasCredential: false }),
  health: vi.fn().mockResolvedValue({ ok: false, reason: 'binary not found' }),
};

vi.mock('../../../src/renderer/ipc/client', () => ({
  ipcClient: {
    settings: () => ({
      getUser: vi.fn().mockResolvedValue({
        theme: 'auto', language: 'en', defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file', showEventLog: false,
      }),
      setUser: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

beforeEach(() => {
  Object.defineProperty(global, 'window', {
    value: { sherpa: { agent: mockAgent } },
    writable: true,
  });
});

describe('settings store agent integration', () => {
  test('setAgentCredential calls window.sherpa.agent.storeKey', async () => {
    const { useSettings } = await import('../../../src/renderer/store/settings');
    const state = useSettings.getState();
    await state.setAgentCredential('codex', 'sk-test');
    expect(mockAgent.storeKey).toHaveBeenCalledWith('codex', 'sk-test');
  });
});
