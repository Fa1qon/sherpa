import { describe, test, expect } from 'vitest';
import { MasterChatController } from '../../../src/main/services/master_chat_controller';
import { AgentRegistry } from '../../../src/main/services/agent_registry';
import { SystemPromptAssembler } from '../../../src/main/services/system_prompt_assembler';
import type { AgentPort, AgentSession } from '../../../src/core/ports/agent_port';
import type { AgentSessionConfig } from '../../../src/core/domain/agent';

function makePort(providerId: string): { port: AgentPort; calls: AgentSessionConfig[] } {
  const calls: AgentSessionConfig[] = [];
  const session: AgentSession = {
    id: { value: 'sess-1' },
    onMessage: () => () => {},
    send: async () => {},
    awaitTurn: async () => {},
    close: async () => {},
  };
  const port: AgentPort = {
    providerId,
    startSession: async (cfg) => { calls.push(cfg); return session; },
    health: async () => ({ ok: true }),
  };
  return { port, calls };
}

const methodology = { id: 'test', version: '1.0.0', name: 'T', description: '', stages: [], edges: [] };
const stage = { id: 's1', name: 'S1', mode: 'auto' as const, contract: { input: [], output: { path: 'out.md' } }, prompt: 'Do it.' };
const task = { id: 't1', title: 'T', status: 'created', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [], methodology_selection_mode: 'none' } as any;

describe('MasterChatController with AgentRegistry', () => {
  test('uses claude-code adapter when agentCli is undefined', async () => {
    const registry = new AgentRegistry();
    const { port: cc, calls } = makePort('claude-code');
    registry.register('claude-code', cc);
    const ctrl = new MasterChatController(registry, new SystemPromptAssembler());
    await ctrl.runTurn({ userMessage: 'hi', methodology, stage, task, cwd: '/tmp' });
    expect(calls.length).toBe(1);
  });

  test('uses codex adapter when agentCli is "codex"', async () => {
    const registry = new AgentRegistry();
    const { port: cc } = makePort('claude-code');
    const { port: codex, calls } = makePort('codex');
    registry.register('claude-code', cc);
    registry.register('codex', codex);
    const ctrl = new MasterChatController(registry, new SystemPromptAssembler());
    await ctrl.runTurn({ userMessage: 'hi', methodology, stage, task, cwd: '/tmp', agentCli: 'codex' });
    expect(calls.length).toBe(1);
  });
});
