import { describe, test, expect } from 'vitest';
import { CodexAdapter } from '../../../../../src/core/adapters/agents/codex/adapter';
import type { AgentSessionConfig } from '../../../../../src/core/domain/agent';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

const config: AgentSessionConfig = { cwd: '/tmp/test', systemPrompt: 'You are a test assistant.' };

describe('CodexAdapter', () => {
  test('providerId is codex', () => { expect(new CodexAdapter().providerId).toBe('codex'); });
  test('binaryName is codex', () => { expect(new CodexAdapter().binaryName).toBe('codex'); });
  test('buildArgs returns exec + text + --json + --full-auto for fresh session', () => {
    const args = new CodexAdapter().buildArgs(config, 'hello world', '/tmp/sp.txt');
    expect(args).toEqual(['exec', 'hello world', '--json', '--full-auto']);
  });
  test('buildArgs uses resume when resumeSessionId is set', () => {
    const args = new CodexAdapter().buildArgs({ ...config, resumeSessionId: 'thread-abc-123' }, 'follow up', '/tmp/sp.txt');
    expect(args).toEqual(['exec', 'resume', 'thread-abc-123', 'follow up', '--json', '--full-auto']);
  });
  test('handleLine emits agent message for item.completed assistant message', () => {
    const msgs: AgentMessage[] = [];
    new CodexAdapter().handleLine({ type: 'item.completed', item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello from Codex' }] } }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('agent');
    expect(msgs[0]!.text).toBe('Hello from Codex');
  });
  test('handleLine ignores non-message events', () => {
    const msgs: AgentMessage[] = [];
    new CodexAdapter().handleLine({ type: 'turn.started' }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(0);
  });
  test('extractSessionId reads threadId from session_summary', () => {
    expect(new CodexAdapter().extractSessionId({ type: 'session_summary', threadId: 'thread-xyz' })).toBe('thread-xyz');
  });
  test('extractSessionId returns undefined for other events', () => {
    expect(new CodexAdapter().extractSessionId({ type: 'turn.started' })).toBeUndefined();
  });
  test('buildCredentialEnv maps apiKey to OPENAI_API_KEY', () => {
    expect(new CodexAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'sk-test' })).toEqual({ OPENAI_API_KEY: 'sk-test' });
  });
  test('buildCredentialEnv returns empty for no credential', () => {
    expect(new CodexAdapter().buildCredentialEnv(undefined)).toEqual({});
  });
});
