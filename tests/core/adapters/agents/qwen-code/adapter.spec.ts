import { describe, test, expect } from 'vitest';
import { QwenCodeAdapter } from '../../../../../src/core/adapters/agents/qwen-code/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('QwenCodeAdapter', () => {
  test('providerId is qwen-code', () => { expect(new QwenCodeAdapter().providerId).toBe('qwen-code'); });
  test('buildArgs passes -p text --output-format stream-json', () => {
    const args = new QwenCodeAdapter().buildArgs({ cwd: '/tmp' }, 'refactor this', '/tmp/sp.txt');
    expect(args).toContain('-p');
    expect(args).toContain('refactor this');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
  });
  test('buildArgs passes --resume when resumeSessionId set', () => {
    const args = new QwenCodeAdapter().buildArgs({ cwd: '/tmp', resumeSessionId: 'qwen-001' }, 'next', '/tmp/sp.txt');
    expect(args).toContain('--resume');
    expect(args).toContain('qwen-001');
  });
  test('handleLine emits for model role message', () => {
    const msgs: AgentMessage[] = [];
    new QwenCodeAdapter().handleLine({ type: 'message', role: 'model', content: [{ text: 'Qwen says hello' }] }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Qwen says hello');
  });
  test('extractSessionId reads sessionId from result', () => {
    expect(new QwenCodeAdapter().extractSessionId({ type: 'result', sessionId: 'qwen-sess' })).toBe('qwen-sess');
  });
  test('buildCredentialEnv maps apiKey to DASHSCOPE_API_KEY', () => {
    expect(new QwenCodeAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'sk-qwen-123' })).toMatchObject({ DASHSCOPE_API_KEY: 'sk-qwen-123' });
  });
});
