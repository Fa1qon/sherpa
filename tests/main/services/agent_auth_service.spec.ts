import { describe, test, expect } from 'vitest';
import type { SettingsPort } from '../../../src/core/ports/settings_port';
import type { UserSettings } from '../../../src/core/domain/settings';
import { defaultUserSettings } from '../../../src/core/domain/settings';
import { AgentAuthService } from '../../../src/main/services/agent_auth_service';

function makeSettings(initial?: Partial<UserSettings>): { port: SettingsPort; store: { value: UserSettings } } {
  const store = { value: { ...defaultUserSettings(), ...initial } };
  const port: SettingsPort = {
    getUserSettings: async () => store.value,
    setUserSettings: async (s) => { store.value = s; },
    getProjectSettings: async () => ({
      methodologiesPath: '.sherpa/core/methodologies',
      casesPath: '.sherpa/cases',
      reviewersPath: '.sherpa/core/reviewers',
    }),
    setProjectSettings: async () => {},
  };
  return { port, store };
}

describe('AgentAuthService', () => {
  test('storeApiKey saves credential', async () => {
    const { port, store } = makeSettings();
    const svc = new AgentAuthService(port);
    await svc.storeApiKey('codex', 'my-api-key');
    expect(store.value.agentCredentials?.['codex']).toEqual({ type: 'apikey', apiKey: 'my-api-key' });
  });

  test('getCredential returns stored key', async () => {
    const { port } = makeSettings();
    const svc = new AgentAuthService(port);
    await svc.storeApiKey('gemini', 'gemini-key');
    const cred = await svc.getCredential('gemini');
    expect(cred).toEqual({ type: 'apikey', apiKey: 'gemini-key' });
  });

  test('getCredential returns undefined when not set', async () => {
    const { port } = makeSettings();
    const svc = new AgentAuthService(port);
    const cred = await svc.getCredential('codex');
    expect(cred).toBeUndefined();
  });

  test('revokeCredential removes one key but keeps others', async () => {
    const { port, store } = makeSettings();
    const svc = new AgentAuthService(port);
    await svc.storeApiKey('codex', 'key-codex');
    await svc.storeApiKey('gemini', 'key-gemini');
    await svc.revokeCredential('codex');
    expect(store.value.agentCredentials?.['codex']).toBeUndefined();
    expect(store.value.agentCredentials?.['gemini']).toEqual({ type: 'apikey', apiKey: 'key-gemini' });
  });

  test('storeOAuthToken saves oauth credential', async () => {
    const { port, store } = makeSettings();
    const svc = new AgentAuthService(port);
    await svc.storeOAuthToken('opencode', {
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      expiresAt: 9999999,
    });
    expect(store.value.agentCredentials?.['opencode']).toEqual({
      type: 'oauth',
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      expiresAt: 9999999,
    });
  });
});
