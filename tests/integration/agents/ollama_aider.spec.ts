import { describe, test, expect, beforeAll } from 'vitest';
import { ensureOllamaModel, waitForOllama, OLLAMA_BASE_URL, OLLAMA_MODEL } from './_helpers/ollama';
import { AiderAdapter } from '../../../src/core/adapters/agents/aider';
import type { AgentMessage } from '../../../src/core/domain/agent';

const run = process.env['SHERPA_OLLAMA_INTEGRATION'] === '1';

describe.runIf(run)('AiderAdapter — Ollama integration', () => {
  beforeAll(() => { waitForOllama(); ensureOllamaModel(); }, 15 * 60 * 1000);
  test('receives a non-empty plain-text response via Ollama', async () => {
    const adapter = new AiderAdapter({ provider: 'ollama' });
    const session = await adapter.startSession({ cwd: process.cwd(), model: `ollama/${OLLAMA_MODEL}` });
    const messages: AgentMessage[] = [];
    session.onMessage((m) => messages.push(m));
    await session.send('What is 2+2? Reply with just the number.');
    await session.awaitTurn();
    await session.close();
    const agentMsgs = messages.filter((m) => m.role === 'agent');
    expect(agentMsgs.length).toBeGreaterThan(0);
    expect(agentMsgs[0]!.text.trim().length).toBeGreaterThan(0);
  }, 120_000);
});
