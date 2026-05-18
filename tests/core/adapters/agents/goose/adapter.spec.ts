import { describe, test, expect } from 'vitest';
import { GooseAdapter } from '../../../../../src/core/adapters/agents/goose/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('GooseAdapter', () => {
  test('providerId is goose', () => { expect(new GooseAdapter().providerId).toBe('goose'); });
  test('buildArgs returns run -t text --output-format stream-json', () => {
    const args = new GooseAdapter().buildArgs({ cwd: '/tmp' }, 'write tests', '/tmp/sp.txt');
    expect(args[0]).toBe('run');
    expect(args).toContain('-t');
    expect(args).toContain('write tests');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
  });
  test('buildArgs passes --resume when resumeSessionId is set', () => {
    const args = new GooseAdapter().buildArgs({ cwd: '/tmp', resumeSessionId: 'goose-123' }, 'next step', '/tmp/sp.txt');
    expect(args).toContain('--resume');
    expect(args).toContain('goose-123');
  });
  test('handleLine emits agent message for assistant Message event', () => {
    const msgs: AgentMessage[] = [];
    new GooseAdapter().handleLine({ type: 'Message', role: 'assistant', content: [{ type: 'text', text: 'Done!' }] }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Done!');
  });
  test('extractSessionId reads session_id from finish event', () => {
    expect(new GooseAdapter().extractSessionId({ type: 'finish', session_id: 'goose-sess-abc' })).toBe('goose-sess-abc');
  });
  test('buildCredentialEnv returns empty for undefined', () => {
    expect(new GooseAdapter().buildCredentialEnv(undefined)).toEqual({});
  });
  test('buildCredentialEnv passes GOOSE_PROVIDER for ollama apiKey', () => {
    const env = new GooseAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'ollama' });
    expect(env.GOOSE_PROVIDER).toBe('ollama');
  });
});
