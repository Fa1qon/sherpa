import { describe, test, expect } from 'vitest';
import { AiderAdapter } from '../../../../../src/core/adapters/agents/aider/adapter';

describe('AiderAdapter', () => {
  test('providerId is aider', () => { expect(new AiderAdapter().providerId).toBe('aider'); });
  test('binaryName is aider', () => { expect(new AiderAdapter().binaryName).toBe('aider'); });
  test('buildArgs passes --message, --yes, --no-pretty', () => {
    const args = new AiderAdapter().buildArgs({ cwd: '/tmp' }, 'fix the tests');
    expect(args).toContain('--message');
    expect(args).toContain('fix the tests');
    expect(args).toContain('--yes');
    expect(args).toContain('--no-pretty');
  });
  test('buildArgs passes --model when set', () => {
    const args = new AiderAdapter().buildArgs({ cwd: '/tmp', model: 'ollama/gemma3:4b' }, 'task');
    expect(args).toContain('--model');
    expect(args).toContain('ollama/gemma3:4b');
  });
  test('buildCredentialEnv maps apiKey to ANTHROPIC_API_KEY when provider is anthropic', () => {
    const env = new AiderAdapter({ provider: 'anthropic' }).buildCredentialEnv({ type: 'apikey', apiKey: 'sk-ant-x' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-x');
  });
  test('buildCredentialEnv maps apiKey to OPENAI_API_KEY for openai', () => {
    const env = new AiderAdapter({ provider: 'openai' }).buildCredentialEnv({ type: 'apikey', apiKey: 'sk-openai-x' });
    expect(env.OPENAI_API_KEY).toBe('sk-openai-x');
  });
  test('buildCredentialEnv sets OLLAMA_API_BASE for ollama provider', () => {
    const env = new AiderAdapter({ provider: 'ollama' }).buildCredentialEnv(undefined);
    expect(env.OLLAMA_API_BASE).toBe('http://localhost:11434');
  });
  test('returnedSessionId is always undefined', async () => {
    const session = await new AiderAdapter().startSession({ cwd: process.cwd() });
    expect(session.returnedSessionId).toBeUndefined();
  });
});
