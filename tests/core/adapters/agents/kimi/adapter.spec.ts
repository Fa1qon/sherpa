import { describe, test, expect } from 'vitest';
import { KimiAdapter } from '../../../../../src/core/adapters/agents/kimi/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('KimiAdapter', () => {
  test('providerId is kimi', () => { expect(new KimiAdapter().providerId).toBe('kimi'); });
  test('buildArgs passes --print and --output-format stream-json', () => {
    const args = new KimiAdapter().buildArgs({ cwd: '/tmp' }, 'analyze code', '/tmp/sp.txt');
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('-m');
    expect(args).toContain('analyze code');
  });
  test('buildArgs passes --session for resume', () => {
    const args = new KimiAdapter().buildArgs({ cwd: '/tmp', resumeSessionId: 'kimi-sess-1' }, 'next', '/tmp/sp.txt');
    expect(args).toContain('--session');
    expect(args).toContain('kimi-sess-1');
  });
  test('handleLine emits for assistant message', () => {
    const msgs: AgentMessage[] = [];
    new KimiAdapter().handleLine({ type: 'message', role: 'assistant', content: 'Kimi analysis done' }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Kimi analysis done');
  });
  test('extractSessionId reads session_id from result', () => {
    expect(new KimiAdapter().extractSessionId({ type: 'result', session_id: 'kimi-xxx' })).toBe('kimi-xxx');
  });
  test('buildCredentialEnv maps apiKey to MOONSHOT_API_KEY', () => {
    expect(new KimiAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'ms-key-001' })).toMatchObject({ MOONSHOT_API_KEY: 'ms-key-001' });
  });
});
