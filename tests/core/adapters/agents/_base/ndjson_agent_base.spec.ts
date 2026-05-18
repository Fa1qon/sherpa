import { describe, test, expect, vi } from 'vitest';
import { NdjsonAgentBase, type NdjsonAgentOptions } from '../../../../../src/core/adapters/agents/_base/ndjson_agent_base';
import type { AgentMessage, AgentSessionConfig } from '../../../../../src/core/domain/agent';
import type { AgentCredential } from '../../../../../src/core/domain/settings';

class TestAdapter extends NdjsonAgentBase {
  readonly providerId = 'test';
  readonly binaryName: string = 'echo';

  buildArgs(config: AgentSessionConfig, text: string, _spFile: string): string[] {
    const line = JSON.stringify({ type: 'message', role: 'assistant', text });
    return [line];
  }

  handleLine(parsed: unknown, emit: (msg: AgentMessage) => void): void {
    if (typeof parsed !== 'object' || parsed === null) return;
    const p = parsed as Record<string, unknown>;
    if (p.type === 'message' && p.role === 'assistant' && typeof p.text === 'string') {
      emit({ id: 'test-id', role: 'agent', text: p.text, timestamp: new Date().toISOString() });
    }
  }

  extractSessionId(parsed: unknown): string | undefined {
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const p = parsed as Record<string, unknown>;
    if (p.type === 'result' && typeof p.sessionId === 'string') return p.sessionId;
    return undefined;
  }

  buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    if (!credential) return {};
    if (credential.type === 'apikey' && credential.apiKey) return { TEST_API_KEY: credential.apiKey };
    return {};
  }
}

describe('NdjsonAgentBase', () => {
  const config: AgentSessionConfig = { cwd: process.cwd(), systemPrompt: 'You are a test assistant.' };

  test('health() returns ok:true when binary exists', async () => {
    const adapter = new TestAdapter();
    const result = await adapter.health();
    expect(result.ok).toBe(true);
  });

  test('health() returns ok:false for missing binary', async () => {
    class MissingAdapter extends TestAdapter {
      readonly binaryName = 'this-binary-does-not-exist-sherpa-test';
    }
    const adapter = new MissingAdapter();
    const result = await adapter.health();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/binary not found/i);
  });

  test('buildCredentialEnv injects API key', () => {
    const adapter = new TestAdapter();
    const env = adapter.buildCredentialEnv({ type: 'apikey', apiKey: 'sk-123' });
    expect(env).toEqual({ TEST_API_KEY: 'sk-123' });
  });

  test('buildCredentialEnv returns empty for missing credential', () => {
    const adapter = new TestAdapter();
    expect(adapter.buildCredentialEnv(undefined)).toEqual({});
  });

  test('startSession returns an AgentSession with required interface', async () => {
    const adapter = new TestAdapter();
    const session = await adapter.startSession(config);
    expect(typeof session.id.value).toBe('string');
    expect(typeof session.send).toBe('function');
    expect(typeof session.onMessage).toBe('function');
    expect(typeof session.awaitTurn).toBe('function');
    expect(typeof session.close).toBe('function');
  });

  test('onMessage unsubscribe stops receiving messages', async () => {
    const adapter = new TestAdapter();
    const session = await adapter.startSession(config);
    const msgs: AgentMessage[] = [];
    const unsub = session.onMessage((m) => msgs.push(m));
    unsub();
    await session.send('hello');
    await session.awaitTurn();
    expect(msgs).toHaveLength(0);
  });
});
