import { describe, test, expect } from 'vitest';
import { GeminiAdapter } from '../../../../../src/core/adapters/agents/gemini/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('GeminiAdapter', () => {
  test('providerId is gemini', () => { expect(new GeminiAdapter().providerId).toBe('gemini'); });
  test('buildArgs passes -p and --output-format stream-json', () => {
    const args = new GeminiAdapter().buildArgs({ cwd: '/tmp' }, 'hello', '/tmp/sp.txt');
    expect(args).toContain('-p');
    expect(args).toContain('hello');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
  });
  test('buildArgs passes --resume when resumeSessionId set', () => {
    const args = new GeminiAdapter().buildArgs({ cwd: '/tmp', resumeSessionId: 'abc-uuid' }, 'hi', '/tmp/sp.txt');
    expect(args).toContain('--resume');
    expect(args).toContain('abc-uuid');
  });
  test('handleLine emits message for model role', () => {
    const msgs: AgentMessage[] = [];
    new GeminiAdapter().handleLine({ type: 'message', role: 'model', content: [{ text: 'Hello from Gemini' }] }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Hello from Gemini');
  });
  test('handleLine ignores non-model messages', () => {
    const msgs: AgentMessage[] = [];
    new GeminiAdapter().handleLine({ type: 'message', role: 'user', content: [] }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(0);
  });
  test('extractSessionId reads sessionId from result event', () => {
    expect(new GeminiAdapter().extractSessionId({ type: 'result', sessionId: 'gemini-session-001' })).toBe('gemini-session-001');
  });
  test('buildCredentialEnv maps apiKey to GEMINI_API_KEY', () => {
    expect(new GeminiAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'AIza_test' })).toEqual({ GEMINI_API_KEY: 'AIza_test' });
  });
});
