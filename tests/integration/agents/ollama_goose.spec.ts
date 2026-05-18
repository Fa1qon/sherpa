import { describe, test, expect, beforeAll } from 'vitest';
import { ensureOllamaModel, waitForOllama } from './_helpers/ollama';
import { GooseAdapter } from '../../../src/core/adapters/agents/goose';

const run = process.env['SHERPA_OLLAMA_INTEGRATION'] === '1';

describe.runIf(run)('GooseAdapter — Ollama integration', () => {
  beforeAll(() => {
    waitForOllama();
    ensureOllamaModel();
  }, 15 * 60 * 1000);

  test('receives a non-empty agent response from gemma3:4b', async () => {
    const adapter = new GooseAdapter();
    const session = await adapter.startSession({ cwd: process.cwd() });
    const messages: import('../../../src/core/domain/agent').AgentMessage[] = [];
    session.onMessage((m) => messages.push(m));
    await session.send('Reply with exactly: "hello from goose"');
    await session.awaitTurn();
    await session.close();
    const agentMsgs = messages.filter((m) => m.role === 'agent');
    expect(agentMsgs.length).toBeGreaterThan(0);
    expect(agentMsgs.map((m) => m.text).join(' ').length).toBeGreaterThan(0);
  }, 120_000);
});
