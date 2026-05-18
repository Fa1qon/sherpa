import { describe, test, expect, beforeAll } from 'vitest';
import { ensureOllamaModel, waitForOllama, OLLAMA_BASE_URL, OLLAMA_MODEL } from './_helpers/ollama';
import { CopilotAdapter } from '../../../src/core/adapters/agents/copilot';

const run = process.env['SHERPA_OLLAMA_INTEGRATION'] === '1';

describe.runIf(run)('CopilotAdapter — Ollama integration', () => {
  beforeAll(() => {
    waitForOllama();
    ensureOllamaModel();
  }, 15 * 60 * 1000);

  test('receives a non-empty agent response via Ollama endpoint', async () => {
    process.env['COPILOT_PROVIDER_BASE_URL'] = OLLAMA_BASE_URL;
    process.env['COPILOT_OFFLINE'] = 'true';
    process.env['COPILOT_MODEL'] = OLLAMA_MODEL;
    const adapter = new CopilotAdapter();
    const session = await adapter.startSession({ cwd: process.cwd() });
    const messages: import('../../../src/core/domain/agent').AgentMessage[] = [];
    session.onMessage((m) => messages.push(m));
    await session.send('Reply with exactly: "hello from copilot"');
    await session.awaitTurn();
    await session.close();
    delete process.env['COPILOT_PROVIDER_BASE_URL'];
    delete process.env['COPILOT_OFFLINE'];
    delete process.env['COPILOT_MODEL'];
    const agentMsgs = messages.filter((m) => m.role === 'agent');
    expect(agentMsgs.length).toBeGreaterThan(0);
    expect(agentMsgs.map((m) => m.text).join(' ').length).toBeGreaterThan(0);
  }, 120_000);
});
