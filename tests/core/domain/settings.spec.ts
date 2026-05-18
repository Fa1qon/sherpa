// tests/core/domain/settings.spec.ts
import { describe, test, expect } from 'vitest';
import {
  defaultUserSettings,
  defaultProjectSettings,
  isUserSettings,
  isProjectSettings,
  type AgentCli,
  type AgentCredential,
} from '../../../src/core/domain/settings';

describe('Settings domain', () => {
  test('defaults are valid UserSettings', () => {
    const s = defaultUserSettings();
    expect(isUserSettings(s)).toBe(true);
    expect(s.theme).toBe('auto');
    expect(s.language).toBe('en');
    expect(s.costTracking.showCost).toBe(false);
    expect(s.costTracking.pricePerMillionInputTokens).toBe(0);
    expect(s.costTracking.pricePerMillionOutputTokens).toBe(0);
  });

  test('defaults are valid ProjectSettings', () => {
    const s = defaultProjectSettings();
    expect(isProjectSettings(s)).toBe(true);
    expect(s.methodologiesPath).toBe('.sherpa/core/methodologies');
  });

  test('isUserSettings rejects unknown theme', () => {
    expect(isUserSettings({ theme: 'sepia', language: 'en' })).toBe(false);
  });

  test('isUserSettings rejects unknown language', () => {
    expect(isUserSettings({ theme: 'dark', language: 'fr' })).toBe(false);
  });

  test('isUserSettings rejects unknown defaultAgentCli', () => {
    expect(
      isUserSettings({ theme: 'dark', language: 'en', defaultAgentCli: 'gpt-4' }),
    ).toBe(false);
  });

  test('isUserSettings rejects when costTracking is missing', () => {
    expect(
      isUserSettings({ theme: 'dark', language: 'en', defaultAgentCli: 'claude-code' }),
    ).toBe(false);
  });

  test('isUserSettings rejects when costTracking has negative prices', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: -1, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file',
        showEventLog: false,
      }),
    ).toBe(false);
  });

  test('isUserSettings accepts valid costTracking with non-zero prices', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: true, pricePerMillionInputTokens: 3.0, pricePerMillionOutputTokens: 15.0 },
        complianceOutputMode: 'file',
        showEventLog: false,
      }),
    ).toBe(true);
  });

  test('isUserSettings rejects when complianceOutputMode is missing', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
      }),
    ).toBe(false);
  });

  test('isUserSettings rejects unknown complianceOutputMode', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'always',
        showEventLog: false,
      }),
    ).toBe(false);
  });

  test('isUserSettings rejects when showEventLog is missing', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file',
      }),
    ).toBe(false);
  });

  test('isUserSettings accepts showEventLog=true', () => {
    expect(
      isUserSettings({
        theme: 'dark',
        language: 'en',
        defaultAgentCli: 'claude-code',
        costTracking: { showCost: false, pricePerMillionInputTokens: 0, pricePerMillionOutputTokens: 0 },
        complianceOutputMode: 'file',
        showEventLog: true,
      }),
    ).toBe(true);
  });

  test('isProjectSettings rejects unknown agentCli', () => {
    expect(
      isProjectSettings({
        methodologiesPath: '.sherpa/core/methodologies',
        casesPath: '.sherpa/cases',
        reviewersPath: '.sherpa/core/reviewers',
        agentCli: 'gpt-4',
      }),
    ).toBe(false);
  });

  test('isProjectSettings accepts when agentCli is undefined', () => {
    expect(
      isProjectSettings({
        methodologiesPath: '.sherpa/core/methodologies',
        casesPath: '.sherpa/cases',
        reviewersPath: '.sherpa/core/reviewers',
      }),
    ).toBe(true);
  });

  test('ProjectSettings accepts optional language', () => {
    expect(
      isProjectSettings({
        ...defaultProjectSettings(),
        language: 'ru',
      }),
    ).toBe(true);
  });

  test('ProjectSettings rejects unknown language', () => {
    expect(
      isProjectSettings({
        ...defaultProjectSettings(),
        language: 'fr',
      }),
    ).toBe(false);
  });
});

describe('ProjectSettings — new fields', () => {
  test('defaultProjectSettings has permissionMode bypass', () => {
    expect(defaultProjectSettings().permissionMode).toBe('bypass');
  });

  test('defaultProjectSettings has defaultEffort normal', () => {
    expect(defaultProjectSettings().defaultEffort).toBe('normal');
  });

  test('defaultProjectSettings has allowOutsideProjectAccess false', () => {
    expect(defaultProjectSettings().allowOutsideProjectAccess).toBe(false);
  });

  test('isProjectSettings accepts valid permissionMode values', () => {
    const base = defaultProjectSettings();
    expect(isProjectSettings({ ...base, permissionMode: 'bypass' })).toBe(true);
    expect(isProjectSettings({ ...base, permissionMode: 'acceptEdits' })).toBe(true);
    expect(isProjectSettings({ ...base, permissionMode: 'auto' })).toBe(true);
  });

  test('isProjectSettings rejects invalid permissionMode', () => {
    const base = defaultProjectSettings();
    expect(isProjectSettings({ ...base, permissionMode: 'unknown' })).toBe(false);
  });

  test('isProjectSettings accepts valid defaultEffort values', () => {
    const base = defaultProjectSettings();
    expect(isProjectSettings({ ...base, defaultEffort: 'fast' })).toBe(true);
    expect(isProjectSettings({ ...base, defaultEffort: 'normal' })).toBe(true);
    expect(isProjectSettings({ ...base, defaultEffort: 'thorough' })).toBe(true);
  });

  test('isProjectSettings accepts boolean allowOutsideProjectAccess', () => {
    const base = defaultProjectSettings();
    expect(isProjectSettings({ ...base, allowOutsideProjectAccess: true })).toBe(true);
    expect(isProjectSettings({ ...base, allowOutsideProjectAccess: false })).toBe(true);
  });

  test('legacy ProjectSettings without new fields still validates (backwards-compat)', () => {
    const legacy = {
      methodologiesPath: '.sherpa/core/methodologies',
      casesPath: '.sherpa/cases',
      reviewersPath: '.sherpa/core/reviewers',
    };
    expect(isProjectSettings(legacy)).toBe(true);
  });
});

describe('AgentCli extended values', () => {
  const ALL_AGENT_CLIS: AgentCli[] = [
    'claude-code', 'codex', 'opencode', 'gemini', 'goose',
    'amp', 'cursor', 'copilot', 'pi', 'qwen-code', 'kimi', 'aider',
  ];

  test('all AgentCli values are accepted by isUserSettings', () => {
    for (const cli of ALL_AGENT_CLIS) {
      const s = { ...defaultUserSettings(), defaultAgentCli: cli };
      expect(isUserSettings(s), `failed for ${cli}`).toBe(true);
    }
  });

  test('unknown AgentCli value is rejected', () => {
    const s = { ...defaultUserSettings(), defaultAgentCli: 'unknown-agent' };
    expect(isUserSettings(s)).toBe(false);
  });

  test('agentCredentials apikey is accepted by isUserSettings', () => {
    const cred: AgentCredential = { type: 'apikey', apiKey: 'sk-test' };
    const s = { ...defaultUserSettings(), agentCredentials: { codex: cred } };
    expect(isUserSettings(s)).toBe(true);
  });

  test('agentCredentials oauth is accepted by isUserSettings', () => {
    const cred: AgentCredential = {
      type: 'oauth',
      accessToken: 'tok_abc',
      refreshToken: 'ref_xyz',
      expiresAt: Date.now() + 3600_000,
    };
    const s = { ...defaultUserSettings(), agentCredentials: { gemini: cred } };
    expect(isUserSettings(s)).toBe(true);
  });
});
