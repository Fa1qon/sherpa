import { describe, test, expect } from 'vitest';
import { CopilotAdapter } from '../../../../../src/core/adapters/agents/copilot/adapter';
import type { AgentMessage } from '../../../../../src/core/domain/agent';

describe('CopilotAdapter', () => {
  test('providerId is copilot', () => { expect(new CopilotAdapter().providerId).toBe('copilot'); });
  test('buildArgs passes -p and --output-format=json', () => {
    const args = new CopilotAdapter().buildArgs({ cwd: '/tmp' }, 'fix bug', '/tmp/sp.txt');
    expect(args).toContain('-p');
    expect(args).toContain('fix bug');
    expect(args.some(a => a.startsWith('--output-format'))).toBe(true);
  });
  test('handleLine emits for assistant JSONL event', () => {
    const msgs: AgentMessage[] = [];
    new CopilotAdapter().handleLine({ type: 'message', role: 'assistant', content: 'Copilot answer' }, (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.text).toBe('Copilot answer');
  });
  test('extractSessionId reads sessionId from result', () => {
    expect(new CopilotAdapter().extractSessionId({ type: 'session_end', sessionId: 'cop-123' })).toBe('cop-123');
  });
  test('buildCredentialEnv maps PAT to COPILOT_GITHUB_TOKEN', () => {
    const env = new CopilotAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'ghp_xxx' });
    expect(env.COPILOT_GITHUB_TOKEN).toBe('ghp_xxx');
  });
  test('buildCredentialEnv sets Ollama env when apiKey is "ollama"', () => {
    const env = new CopilotAdapter().buildCredentialEnv({ type: 'apikey', apiKey: 'ollama' });
    expect(env.COPILOT_PROVIDER_BASE_URL).toBe('http://localhost:11434');
    expect(env.COPILOT_OFFLINE).toBe('true');
  });
});
