import { describe, test, expect } from 'vitest';
import { PiAdapter } from '../../../../../src/core/adapters/agents/pi/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('PiAdapter', () => {
  test('providerId is pi', () => { expect(new PiAdapter().providerId).toBe('pi'); });
  test('buildArgs passes -p text --mode rpc', () => {
    const args = new PiAdapter().buildArgs({ cwd: '/tmp' }, 'do task', '/tmp/sp.txt');
    expect(args).toContain('-p');
    expect(args).toContain('do task');
    expect(args).toContain('--mode');
    expect(args).toContain('rpc');
  });
  test('buildArgs passes --session for resume', () => {
    const args = new PiAdapter().buildArgs({ cwd: '/tmp', resumeSessionId: 'pi-sess-001' }, 'next', '/tmp/sp.txt');
    expect(args).toContain('--session');
    expect(args).toContain('pi-sess-001');
  });
  test('handleLine emits for assistant message type', () => {
    const msgs: AgentMessage[] = [];
    new PiAdapter().handleLine({ type: 'message', role: 'assistant', content: 'Pi response here' }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Pi response here');
  });
  test('extractSessionId reads session_id from done event', () => {
    expect(new PiAdapter().extractSessionId({ type: 'done', session_id: 'pi-xxx' })).toBe('pi-xxx');
  });
  test('buildCredentialEnv maps apiKey to ANTHROPIC_API_KEY for anthropic provider', () => {
    const env = new PiAdapter({ provider: 'anthropic' }).buildCredentialEnv({ type: 'apikey', apiKey: 'sk-ant-test' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
  });
});
