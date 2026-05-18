import { describe, test, expect } from 'vitest';
import { OpenCodeAdapter } from '../../../../../src/core/adapters/agents/opencode/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('OpenCodeAdapter', () => {
  test('providerId is opencode', () => { expect(new OpenCodeAdapter().providerId).toBe('opencode'); });
  test('buildArgs returns run -m text --format json', () => {
    const args = new OpenCodeAdapter().buildArgs({ cwd: '/tmp' }, 'fix the bug', '/tmp/sp.txt');
    expect(args[0]).toBe('run');
    expect(args).toContain('-m');
    expect(args).toContain('fix the bug');
    expect(args).toContain('--format');
    expect(args).toContain('json');
  });
  test('buildArgs passes --model when set', () => {
    const args = new OpenCodeAdapter().buildArgs({ cwd: '/tmp', model: 'ollama/gemma3:4b' }, 'test', '/tmp/sp.txt');
    expect(args).toContain('--model');
    expect(args).toContain('ollama/gemma3:4b');
  });
  test('buildArgs passes --continue when resumeSessionId is set', () => {
    const args = new OpenCodeAdapter().buildArgs({ cwd: '/tmp', resumeSessionId: 'ses_abc' }, 'continue', '/tmp/sp.txt');
    expect(args).toContain('--continue');
  });
  test('handleLine emits agent message from OpenCode JSON result', () => {
    const msgs: AgentMessage[] = [];
    new OpenCodeAdapter().handleLine({ id: 'ses_test123', messages: [{ role: 'user', content: 'fix' }, { role: 'assistant', content: 'I fixed the bug in main.ts.' }] }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('agent');
    expect(msgs[0]!.text).toContain('I fixed the bug');
  });
  test('extractSessionId reads id from session result', () => {
    expect(new OpenCodeAdapter().extractSessionId({ id: 'ses_abc123', messages: [] })).toBe('ses_abc123');
  });
  test('buildCredentialEnv returns empty', () => {
    expect(new OpenCodeAdapter().buildCredentialEnv(undefined)).toEqual({});
  });
});
