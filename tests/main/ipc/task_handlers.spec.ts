import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/main/services/sherpa_mcp_server', () => ({
  SherpaMcpServer: class {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    registerSession = vi.fn();
    unregisterSession = vi.fn();
    writeMcpConfig = vi.fn().mockResolvedValue('/tmp/fake-mcp-config.json');
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { Container } from '../../../src/main/container';
import { PORT } from '../../../src/main/composition_root';
import { CH } from '../../../src/main/ipc/channels';
import { registerIpcHandlers } from '../../../src/main/ipc/handlers';
import { TaskService } from '../../../src/main/services/task_service';
import type { MasterChatController, MasterChatResult, MasterChatTurn } from '../../../src/main/services/master_chat_controller';
import type { MethodologyPort, LoadMethodologyResult } from '../../../src/core/ports/methodology_port';
import type { Methodology } from '../../../src/core/domain/methodology';
import type { Task } from '../../../src/core/domain/task';
import type { AgentMessage } from '../../../src/core/domain/agent';

interface FakeIpcMain {
  handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  invokeWithEvent: (event: unknown, channel: string, ...args: unknown[]) => Promise<unknown>;
}

function makeFakeIpcMain(): FakeIpcMain {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handle: (channel, listener) => handlers.set(channel, listener),
    invoke: async (channel, ...args) => {
      const h = handlers.get(channel);
      if (!h) throw new Error(`no handler for ${channel}`);
      return h({}, ...args);
    },
    invokeWithEvent: async (event, channel, ...args) => {
      const h = handlers.get(channel);
      if (!h) throw new Error(`no handler for ${channel}`);
      return h(event, ...args);
    },
  };
}

function fixtureMethodology(): Methodology {
  return {
    id: 'lite',
    version: '1.0.0',
    name: 'Lite',
    description: 'fixture',
    stages: [
      {
        id: 's1',
        name: 'Stage One',
        mode: 'interactive',
        contract: {
          input: [],
          output: { path: 'out.md' },
        },
        prompt: 'do the thing',
      },
    ],
    edges: [],
  };
}

function makeMethodologyMock(loadResult: LoadMethodologyResult): MethodologyPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    load: vi.fn().mockResolvedValue(loadResult),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

interface FakeMasterChat {
  controller: MasterChatController;
  calls: MasterChatTurn[];
}

function makeFakeMasterChat(
  result: MasterChatResult,
  /** Optional messages to call onMessage with before resolving. */
  streamMessages?: AgentMessage[],
): FakeMasterChat {
  const calls: MasterChatTurn[] = [];
  const controller = {
    runTurn: vi.fn(async (turn: MasterChatTurn, onMessage?: (m: AgentMessage) => void): Promise<MasterChatResult> => {
      calls.push(turn);
      if (onMessage && streamMessages) {
        for (const m of streamMessages) {
          onMessage(m);
        }
      }
      return result;
    }),
  } as unknown as MasterChatController;
  return { controller, calls };
}

function workerMsg(id: string, text: string): AgentMessage {
  return { id, role: 'agent', text, timestamp: new Date().toISOString() };
}

function buildContainer(opts: {
  taskService: TaskService;
  masterChat: MasterChatController;
  methodology: MethodologyPort;
}): Container {
  const c = new Container();
  c.register(PORT.project, {
    listRecent: vi.fn(),
    addProject: vi.fn(),
    open: vi.fn(),
    removeFromRecent: vi.fn(),
    get: vi.fn(),
  } as never);
  c.register(PORT.settings, {
    getUserSettings: vi.fn().mockResolvedValue({ theme: 'dark', language: 'en', defaultAgentCli: 'claude', costTracking: { enabled: false }, complianceOutputMode: 'off', showEventLog: false }),
    setUserSettings: vi.fn(),
    getProjectSettings: vi.fn(),
    setProjectSettings: vi.fn(),
  } as never);
  c.register(PORT.methodology, opts.methodology);
  c.register(PORT.task, opts.taskService);
  c.register(PORT.masterChat, opts.masterChat);
  c.register(PORT.files, {
    readDir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
  } as never);
  return c;
}

describe('task IPC handlers', () => {
  let taskService: TaskService;
  let fakeIpc: FakeIpcMain;

  beforeEach(() => {
    taskService = new TaskService();
    fakeIpc = makeFakeIpcMain();
  });

  test('TASK_CREATE creates a task and TASK_GET returns it', async () => {
    const methodology = makeMethodologyMock({ ok: false, error: { kind: 'not-found' } });
    const { controller } = makeFakeMasterChat({ workerOutput: [], translatedText: '', cost: null, tokens: null });
    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    const created = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
    })) as Task;
    expect(created.id).toBeTruthy();
    expect(created.methodologyId).toBe('lite');
    expect(created.stageId).toBe('s1');
    expect(created.thread).toEqual([]);

    const fetched = (await fakeIpc.invoke(CH.TASK_GET, created.id)) as Task | null;
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
  });

  test('TASK_LIST returns array of created tasks', async () => {
    const methodology = makeMethodologyMock({ ok: false, error: { kind: 'not-found' } });
    const { controller } = makeFakeMasterChat({ workerOutput: [], translatedText: '', cost: null, tokens: null });
    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    await fakeIpc.invoke(CH.TASK_CREATE, { methodologyId: 'lite', stageId: 's1' });
    await fakeIpc.invoke(CH.TASK_CREATE, { methodologyId: 'lite', stageId: 's1' });

    const list = (await fakeIpc.invoke(CH.TASK_LIST)) as readonly Task[];
    expect(list).toHaveLength(2);
  });

  test('TASK_RUN_TURN returns task-not-found for unknown task id', async () => {
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: fixtureMethodology(),
      warnings: [],
    });
    const { controller } = makeFakeMasterChat({ workerOutput: [], translatedText: '', cost: null, tokens: null });
    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    const result = (await fakeIpc.invoke(CH.TASK_RUN_TURN, {
      taskId: 'nope',
      projectPath: '/p',
      userMessage: 'hi',
    })) as { ok: false; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('task-not-found');
  });

  test('TASK_RUN_TURN happy path appends user + worker + translation messages', async () => {
    const m = fixtureMethodology();
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: m,
      warnings: [],
    });
    const workerOutput: readonly AgentMessage[] = [
      workerMsg('w1', 'doing thing'),
      workerMsg('w2', 'done'),
    ];
    const { controller, calls } = makeFakeMasterChat({
      workerOutput,
      translatedText: 'готово',
      cost: null,
      tokens: null,
    });
    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    const created = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
    })) as Task;

    const result = (await fakeIpc.invoke(CH.TASK_RUN_TURN, {
      taskId: created.id,
      projectPath: '/p',
      userMessage: 'привет',
    })) as { ok: true; task: Task };

    expect(result.ok).toBe(true);
    // 1 user + 2 worker + 1 translation = 4
    expect(result.task.thread).toHaveLength(4);
    expect(result.task.thread[0].role).toBe('user');
    expect(result.task.thread[0].text).toBe('привет');
    expect(result.task.thread[1]).toEqual(workerOutput[0]);
    expect(result.task.thread[2]).toEqual(workerOutput[1]);
    expect(result.task.thread[3].role).toBe('system');
    expect(result.task.thread[3].text).toBe('готово');

    expect(calls).toHaveLength(1);
    expect(calls[0].userMessage).toBe('привет');
    expect(calls[0].methodology).toBe(m);
    expect(calls[0].stage.id).toBe('s1');
    expect(calls[0].cwd).toBe('/p');
  });

  test('ask_before_edit=true applies acceptEdits to masterChat turn', async () => {
    const m = fixtureMethodology();
    const methodology = makeMethodologyMock({ ok: true, methodology: m, warnings: [] });
    const capturedTurns: MasterChatTurn[] = [];
    const controller = {
      runTurn: vi.fn(async (turn: MasterChatTurn): Promise<MasterChatResult> => {
        capturedTurns.push(turn);
        return { workerOutput: [], translatedText: '', cost: null, tokens: null };
      }),
    } as unknown as MasterChatController;
    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    const created = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
    })) as Task;
    taskService.applySettings(created.id, { ask_before_edit: true });

    await fakeIpc.invoke(CH.TASK_RUN_TURN, {
      taskId: created.id,
      projectPath: '/p',
      userMessage: 'hello',
    });

    expect(capturedTurns).toHaveLength(1);
    expect(capturedTurns[0].permissionMode).toBe('acceptEdits');
  });

  test('TASK_RUN_TURN returns stage-not-found when stage missing from methodology', async () => {
    const m: Methodology = { ...fixtureMethodology(), stages: [] };
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: m,
      warnings: [],
    });
    const { controller } = makeFakeMasterChat({ workerOutput: [], translatedText: '', cost: null, tokens: null });
    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    const created = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
    })) as Task;

    const result = (await fakeIpc.invoke(CH.TASK_RUN_TURN, {
      taskId: created.id,
      projectPath: '/p',
      userMessage: 'hi',
    })) as { ok: false; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('stage-not-found');
  });
});

describe('TASK_START_TURN streaming handler', () => {
  let taskService: TaskService;
  let fakeIpc: FakeIpcMain;

  beforeEach(() => {
    taskService = new TaskService();
    fakeIpc = makeFakeIpcMain();
  });

  test('happy path: fires started, message events, then done with cost/tokens', async () => {
    const m = fixtureMethodology();
    const methodology = makeMethodologyMock({ ok: true, methodology: m, warnings: [] });

    const streamMsgs: AgentMessage[] = [
      workerMsg('w1', 'first'),
      workerMsg('w2', 'second'),
    ];
    const { controller } = makeFakeMasterChat(
      { workerOutput: streamMsgs, translatedText: '', cost: 0.0123, tokens: { input: 100, output: 200 } },
      streamMsgs,
    );

    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    const fakeSender = { send: vi.fn() };
    const fakeEvent = { sender: fakeSender };

    // Create task first.
    const created = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
    })) as Task;

    // Invoke TASK_START_TURN with a fake event that has a sender.
    const result = (await fakeIpc.invokeWithEvent(fakeEvent, CH.TASK_START_TURN, {
      taskId: created.id,
      projectPath: '/p',
      userMessage: 'hello',
    })) as { ok: boolean };

    // Should return immediately with ok: true.
    expect(result.ok).toBe(true);

    // Give the fire-and-forget promise a few ticks to resolve.
    // The .then() block now awaits fsp.unlink (MCP config cleanup) before
    // emitting the `done` event, so we need extra microtask drains.
    for (let i = 0; i < 5; i += 1) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    // sender.send: 1 started + 2 message + 1 done = 4.
    // Stage advance is now driven by the agent calling sherpa_stage_complete
    // via MCP; post-hoc gate evaluation has been removed, so without an
    // explicit tool call the stage stays put and no engine_events fire.
    const calls = fakeSender.send.mock.calls as [string, unknown][];
    expect(calls.length).toBe(4);

    // started event
    expect(calls[0]![0]).toBe('task.event');
    const startedPayload = calls[0]![1] as { kind: string; message?: { role: string; text: string } };
    expect(startedPayload.kind).toBe('started');
    expect(startedPayload.message?.role).toBe('user');
    expect(startedPayload.message?.text).toBe('hello');

    // message events
    expect((calls[1]![1] as { kind: string }).kind).toBe('message');
    expect((calls[2]![1] as { kind: string }).kind).toBe('message');

    // done event
    const donePayload = calls[3]![1] as { kind: string; task: Task };
    expect(donePayload.kind).toBe('done');
    expect(donePayload.task).toBeDefined();
    expect(donePayload.task.totalTokens).toEqual({ input: 100, output: 200 });
  });

  test('bad task-id returns ok:false and emits no events', async () => {
    const methodology = makeMethodologyMock({ ok: false, error: { kind: 'not-found' } });
    const { controller } = makeFakeMasterChat({ workerOutput: [], translatedText: '', cost: null, tokens: null });
    const c = buildContainer({ taskService, masterChat: controller, methodology });
    registerIpcHandlers(c, fakeIpc as never);

    const fakeSender = { send: vi.fn() };
    const fakeEvent = { sender: fakeSender };

    const result = (await fakeIpc.invokeWithEvent(fakeEvent, CH.TASK_START_TURN, {
      taskId: 'does-not-exist',
      projectPath: '/p',
      userMessage: 'hi',
    })) as { ok: false; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toBe('task-not-found');
    // No events should have been emitted.
    expect(fakeSender.send).not.toHaveBeenCalled();
  });
});
