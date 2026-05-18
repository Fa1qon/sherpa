import { describe, test, expect, beforeAll } from 'vitest';
import { ensureOllamaModel, waitForOllama, OLLAMA_BASE_URL, OLLAMA_MODEL } from './_helpers/ollama';
import { QwenCodeAdapter } from '../../../src/core/adapters/agents/qwen-code';
import type { AgentMessage } from '../../../src/core/domain/agent';

const run = process.env['SHERPA_OLLAMA_INTEGRATION'] === '1';

describe.runIf(run)('QwenCodeAdapter — Ollama integration', () => {
  beforeAll(() => { waitForOllama(); ensureOllamaModel(); }, 15 * 60 * 1000);
  test('receives a non-empty agent response via Ollama', async () => {
    process.env['OPENAI_BASE_URL'] = `${OLLAMA_BASE_URL}/v1`;
    process.env['OPENAI_API_KEY'] = 'ollama';
    const adapter = new QwenCodeAdapter();
    const session = await adapter.startSession({ cwd: process.cwd(), model: OLLAMA_MODEL });
    const messages: AgentMessage[] = [];
    session.onMessage((m) => messages.push(m));
    await session.send('Reply with: "hello from qwen"');
    await session.awaitTurn();
    await session.close();
    delete process.env['OPENAI_BASE_URL'];
    delete process.env['OPENAI_API_KEY'];
    const agentMsgs = messages.filter((m) => m.role === 'agent');
    expect(agentMsgs.length).toBeGreaterThan(0);
    expect(agentMsgs[0]!.text.length).toBeGreaterThan(0);
  }, 120_000);
});
