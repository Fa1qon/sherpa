import { describe, test, expect, beforeAll } from 'vitest';
import { ensureOllamaModel, waitForOllama, OLLAMA_BASE_URL, OLLAMA_MODEL } from './_helpers/ollama';
import { PiAdapter } from '../../../src/core/adapters/agents/pi';
import type { AgentMessage } from '../../../src/core/domain/agent';

const run = process.env['SHERPA_OLLAMA_INTEGRATION'] === '1';

describe.runIf(run)('PiAdapter (pi.dev) — Ollama integration', () => {
  beforeAll(() => { waitForOllama(); ensureOllamaModel(); }, 15 * 60 * 1000);
  test('receives a non-empty response via Ollama', async () => {
    const adapter = new PiAdapter();
    const session = await adapter.startSession({ cwd: process.cwd(), model: OLLAMA_MODEL });
    const messages: AgentMessage[] = [];
    session.onMessage((m) => messages.push(m));
    await session.send('Reply with: "hello from pi"');
    await session.awaitTurn();
    await session.close();
    const agentMsgs = messages.filter((m) => m.role === 'agent');
    expect(agentMsgs.length).toBeGreaterThan(0);
    expect(agentMsgs[0]!.text.length).toBeGreaterThan(0);
  }, 120_000);
});
