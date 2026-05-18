import { describe, test, expect } from 'vitest';
import { PlainTextAgentBase } from '../../../../../src/core/adapters/agents/_base/plain_text_agent_base';
import type { AgentSessionConfig } from '../../../../../src/core/domain/agent';
import type { AgentCredential } from '../../../../../src/core/domain/settings';

class TestPlainAdapter extends PlainTextAgentBase {
  readonly providerId = 'test-plain';
  readonly binaryName: string = 'echo';

  buildArgs(_config: AgentSessionConfig, text: string): string[] {
    return [text];
  }

  buildCredentialEnv(_credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    return {};
  }
}

describe('PlainTextAgentBase', () => {
  const config: AgentSessionConfig = { cwd: process.cwd() };

  test('health() returns ok when binary exists', async () => {
    const adapter = new TestPlainAdapter();
    const result = await adapter.health();
    expect(result.ok).toBe(true);
  });

  test('health() returns ok:false for missing binary', async () => {
    class MissingAdapter extends TestPlainAdapter {
      readonly binaryName: string = 'this-binary-does-not-exist-sherpa-test';
    }
    const result = await new MissingAdapter().health();
    expect(result.ok).toBe(false);
  });

  test('send() emits stdout as an agent message', async () => {
    const adapter = new TestPlainAdapter();
    const session = await adapter.startSession(config);
    const msgs: import('../../../../../src/core/domain/agent').AgentMessage[] = [];
    session.onMessage((m) => msgs.push(m));
    await session.send('hello world');
    await session.awaitTurn();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('agent');
    expect(msgs[0]!.text).toContain('hello world');
  });

  test('returnedSessionId is always undefined', async () => {
    const adapter = new TestPlainAdapter();
    const session = await adapter.startSession(config);
    await session.send('test');
    await session.awaitTurn();
    expect(session.returnedSessionId).toBeUndefined();
  });
});
