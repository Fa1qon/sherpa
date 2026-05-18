import { describe, test, expect } from 'vitest';
import type { UserSettings } from '../../../src/core/domain/settings';
import { isUserSettings } from '../../../src/core/domain/settings';

describe('UserSettings with proxy fields', () => {
  test('UserSettings accepts proxyEntries and proxyAssignments', () => {
    const s: UserSettings = {
      theme: 'dark',
      language: 'en',
      defaultAgentCli: 'claude-code',
      costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
      complianceOutputMode: 'off',
      showEventLog: false,
      proxyEntries: [
        { id: 'p1', name: 'Work', type: 'http', host: 'proxy.co', port: 8080 },
      ],
      proxyAssignments: {
        claudeAgent: 'p1',
        userBrowser: 'direct',
        aiBrowser: 'p1',
        webSearch: 'direct',
      },
    };
    expect(s.proxyEntries).toHaveLength(1);
    expect(s.proxyAssignments?.claudeAgent).toBe('p1');
  });

  test('UserSettings accepts omitted proxy fields (backward compat)', () => {
    const s: UserSettings = {
      theme: 'dark',
      language: 'en',
      defaultAgentCli: 'claude-code',
      costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
      complianceOutputMode: 'off',
      showEventLog: false,
    };
    expect(s.proxyEntries).toBeUndefined();
  });
});

describe('isUserSettings runtime guard with proxy fields', () => {
  test('isUserSettings accepts valid proxyEntries and proxyAssignments', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file',
        showEventLog: false,
        proxyEntries: [
          { id: 'p1', name: 'Work', type: 'http', host: 'proxy.co', port: 8080 },
        ],
        proxyAssignments: {
          claudeAgent: 'p1',
          userBrowser: 'direct',
          aiBrowser: 'p1',
          webSearch: 'direct',
        },
      }),
    ).toBe(true);
  });

  test('isUserSettings accepts omitted proxy fields', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file',
        showEventLog: false,
      }),
    ).toBe(true);
  });

  test('isUserSettings rejects malformed proxyEntries element (empty id)', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file',
        showEventLog: false,
        proxyEntries: [
          { id: '', name: 'Work', type: 'http', host: 'proxy.co', port: 8080 },
        ],
      }),
    ).toBe(false);
  });

  test('isUserSettings rejects malformed proxyAssignments (missing key)', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file',
        showEventLog: false,
        proxyAssignments: {
          claudeAgent: 'p1',
          userBrowser: 'direct',
          aiBrowser: 'p1',
          // webSearch: 'direct', — missing key
        },
      }),
    ).toBe(false);
  });
});
