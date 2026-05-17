import { describe, test, expect } from 'vitest';
import {
  MasterChatController,
  adaptForUser,
} from '../../../src/main/services/master_chat_controller';
import { SystemPromptAssembler } from '../../../src/main/services/system_prompt_assembler';
import type { AgentPort, AgentSession } from '../../../src/core/ports/agent_port';
import type { AgentMessage, AgentSessionConfig } from '../../../src/core/domain/agent';
import type { Methodology, Stage } from '../../../src/core/domain/methodology';
import type { Task } from '../../../src/core/domain/task';

// ---------- Test fixtures ----------

const methodology: Methodology = {
  id: 'lite',
  version: '1.0.0',
  name: 'Lite',
  description: 'test',
  stages: [],
  edges: [],
};

const stage: Stage = {
  id: 'impl',
  name: 'Implement',
  mode: 'auto',
  contract: {
    input: [],
    output: { path: 'impl.md' },
  },
  prompt: 'Do the implementation.',
};

const task = {
  id: 'task-1',
  title: 'Test task',
  status: 'created',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [],
  methodology_selection_mode: 'manual',
} as unknown as Task;

const stubAssembler = new SystemPromptAssembler();

function msg(role: AgentMessage['role'], text: string, id = `m-${Math.random()}`): AgentMessage {
  return { id, role, text, timestamp: new Date().toISOString() };
}

// ---------- Mock session/port ----------

interface MockSessionOpts {
  onSend?: (text: string) => Promise<void>;
  emitOnSend?: AgentMessage[];
  usage?: { cost: number | null; tokens: { input: number; output: number } | null };
  returnedSessionId?: string;
}

interface CapturedSession {
  session: AgentSession;
  config: AgentSessionConfig;
  sends: string[];
  closeCalled: number;
  unsubscribeCalled: number;
}

function makeMockSession(config: AgentSessionConfig, opts: MockSessionOpts): CapturedSession {
  const listeners = new Set<(m: AgentMessage) => void>();
  const captured: CapturedSession = {
    session: undefined as unknown as AgentSession,
    config,
    sends: [],
    closeCalled: 0,
    unsubscribeCalled: 0,
  };
  const session: AgentSession = {
    id: { value: `session-${Math.random()}` },
    usage: opts.usage,
    returnedSessionId: opts.returnedSessionId,
    onMessage(cb) {
      listeners.add(cb);
      return () => {
        captured.unsubscribeCalled++;
        listeners.delete(cb);
      };
    },
    async send(text: string) {
      captured.sends.push(text);
      if (opts.onSend) await opts.onSend(text);
      for (const m of opts.emitOnSend ?? []) {
        for (const l of listeners) l(m);
      }
    },
    async awaitTurn() {},
    async close() {
      captured.closeCalled++;
    },
  };
  captured.session = session;
  return captured;
}

function makeMockPort(sessions: MockSessionOpts[]): {
  port: AgentPort;
  captured: CapturedSession[];
  startCalls: AgentSessionConfig[];
} {
  const captured: CapturedSession[] = [];
  const startCalls: AgentSessionConfig[] = [];
  let i = 0;
  const port: AgentPort = {
    providerId: 'mock',
    async startSession(config) {
      startCalls.push(config);
      const opts = sessions[i++] ?? {};
      const c = makeMockSession(config, opts);
      captured.push(c);
      return c.session;
    },
    async health() {
      return { ok: true };
    },
  };
  return { port, captured, startCalls };
}

// ---------- adaptForUser unit tests ----------

describe('adaptForUser', () => {
  test('strips W-tag stage prefix from first line', () => {
    expect(adaptForUser('[W1 | #abc My Task]\nHello')).toBe('Hello');
  });

  test('strips R-tag stage prefix from first line', () => {
    expect(adaptForUser('[R2.1 | #xyz Stage]\nДобро пожаловать')).toBe('Добро пожаловать');
  });

  test('returns Russian text verbatim (no stage tag)', () => {
    const russian = 'Это полностью русский текст. Агент выполнил задачу успешно.';
    expect(adaptForUser(russian)).toBe(russian);
  });

  test('returns English text as-is (no Claude session — pure pass-through)', () => {
    const english = 'I have read the file and completed the implementation.';
    expect(adaptForUser(english)).toBe(english);
  });

  test('handles empty string', () => {
    expect(adaptForUser('')).toBe('');
  });

  test('strips tag from Russian text keeping the rest intact', () => {
    const input = '[W3 | #id Title]\nВсё готово. Файл обновлён.';
    expect(adaptForUser(input)).toBe('Всё готово. Файл обновлён.');
  });

  test('does not strip tag from middle of text', () => {
    const input = 'Some text\n[W1 | #abc]\nMore text';
    expect(adaptForUser(input)).toBe(input);
  });
});

// ---------- MasterChatController tests ----------

describe('MasterChatController', () => {
  test('happy path: single worker session; translatedText is adapted agent output', async () => {
    const workerAgentMsg = msg('agent', 'I read foo.ts and updated it.');
    const workerToolMsg = msg('tool', 'Read foo.ts');

    const { port, captured, startCalls } = makeMockPort([
      { emitOnSend: [workerToolMsg, workerAgentMsg] },
    ]);
    const ctl = new MasterChatController(port, stubAssembler);

    const result = await ctl.runTurn({
      userMessage: 'Сделай foo',
      methodology,
      stage,
      task,
      cwd: '/tmp/proj',
    });

    // Only ONE session (no translator session).
    expect(startCalls).toHaveLength(1);
    expect(startCalls[0].mode).toBe('worker');

    expect(result.workerOutput).toHaveLength(2);
    expect(result.workerOutput[0]).toBe(workerToolMsg);
    expect(result.workerOutput[1]).toBe(workerAgentMsg);
    // translatedText = adaptForUser(agent text) — no stage tag, so same as input.
    expect(result.translatedText).toBe('I read foo.ts and updated it.');

    expect(captured[0].sends).toEqual(['Сделай foo']);
    expect(captured[0].closeCalled).toBe(1);
    expect(captured[0].unsubscribeCalled).toBe(1);
  });

  test('stage tag stripped from translatedText', async () => {
    const workerAgentMsg = msg('agent', '[W2 | #id Stage]\nДело сделано.');
    const { port } = makeMockPort([{ emitOnSend: [workerAgentMsg] }]);
    const ctl = new MasterChatController(port, stubAssembler);

    const result = await ctl.runTurn({ userMessage: 'go', methodology, stage, task, cwd: '/tmp/proj' });

    expect(result.translatedText).toBe('Дело сделано.');
  });

  test('system prompt assembled via SystemPromptAssembler', async () => {
    const workerAgentMsg = msg('agent', 'done');
    const { port, startCalls } = makeMockPort([{ emitOnSend: [workerAgentMsg] }]);
    const ctl = new MasterChatController(port, stubAssembler);

    await ctl.runTurn({ userMessage: 'go', methodology, stage, task, cwd: '/tmp/proj' });

    const workerSystem = startCalls[0].systemPrompt ?? '';
    expect(workerSystem.length).toBeGreaterThan(0);
    expect(workerSystem).toContain('Strictness');
  });

  test('resumeSessionId passed to worker when provided in turn', async () => {
    const { port, startCalls } = makeMockPort([{ emitOnSend: [msg('agent', 'ok')] }]);
    const ctl = new MasterChatController(port, stubAssembler);

    await ctl.runTurn({
      userMessage: 'second message',
      methodology,
      stage,
      task,
      cwd: '/tmp/proj',
      resumeSessionId: 'prev-session-id',
    });

    expect(startCalls[0].resumeSessionId).toBe('prev-session-id');
  });

  test('returnedSessionId propagated from worker session', async () => {
    const { port } = makeMockPort([
      { emitOnSend: [msg('agent', 'ok')], returnedSessionId: 'new-session-id' },
    ]);
    const ctl = new MasterChatController(port, stubAssembler);

    const result = await ctl.runTurn({ userMessage: 'go', methodology, stage, task, cwd: '/tmp/proj' });

    expect(result.returnedSessionId).toBe('new-session-id');
  });

  test('no agent text → translatedText empty, no system message emitted', async () => {
    const workerToolMsg = msg('tool', 'Bash echo');
    const { port, startCalls } = makeMockPort([{ emitOnSend: [workerToolMsg] }]);
    const ctl = new MasterChatController(port, stubAssembler);

    const received: AgentMessage[] = [];
    const result = await ctl.runTurn(
      { userMessage: 'noop', methodology, stage, task, cwd: '/tmp/proj' },
      (m) => received.push(m),
    );

    expect(result.translatedText).toBe('');
    expect(startCalls).toHaveLength(1);
    // Only tool message — no synthetic system msg.
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(workerToolMsg);
  });

  test('onMessage callback receives worker messages only (no synthetic system message)', async () => {
    const workerAgentMsg = msg('agent', 'The result is 42.');
    const workerToolMsg = msg('tool', 'Read file');

    const { port } = makeMockPort([{ emitOnSend: [workerToolMsg, workerAgentMsg] }]);
    const ctl = new MasterChatController(port, stubAssembler);

    const received: AgentMessage[] = [];
    await ctl.runTurn(
      { userMessage: 'go', methodology, stage, task, cwd: '/tmp/proj' },
      (m) => received.push(m),
    );

    // No synthetic system message — AgentTextBubble strips stage tags in the UI.
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(workerToolMsg);
    expect(received[1]).toBe(workerAgentMsg);
  });

  test('cleanup on worker error: unsubscribe + close still run, error propagates', async () => {
    const { port, captured } = makeMockPort([
      {
        onSend: async () => {
          throw new Error('boom');
        },
      },
    ]);
    const ctl = new MasterChatController(port, stubAssembler);

    await expect(
      ctl.runTurn({ userMessage: 'kaboom', methodology, stage, task, cwd: '/tmp/proj' }),
    ).rejects.toThrow('boom');

    expect(captured).toHaveLength(1);
    expect(captured[0].closeCalled).toBe(1);
    expect(captured[0].unsubscribeCalled).toBe(1);
  });

  test('cost and tokens from worker session', async () => {
    const { port } = makeMockPort([
      {
        emitOnSend: [msg('agent', 'done')],
        usage: { cost: 0.01, tokens: { input: 1, output: 2 } },
      },
    ]);
    const ctl = new MasterChatController(port, stubAssembler);

    const result = await ctl.runTurn({ userMessage: 'go', methodology, stage, task, cwd: '/tmp/proj' });

    expect(result.cost).toBe(0.01);
    expect(result.tokens).toEqual({ input: 1, output: 2 });
  });

  test('cost and tokens are null when worker has no usage', async () => {
    const { port } = makeMockPort([{ emitOnSend: [msg('tool', 'bash')] }]);
    const ctl = new MasterChatController(port, stubAssembler);

    const result = await ctl.runTurn({ userMessage: 'noop', methodology, stage, task, cwd: '/tmp' });

    expect(result.cost).toBeNull();
    expect(result.tokens).toBeNull();
  });
});
