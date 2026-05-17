// tests/main/ipc/compliance_autorun.spec.ts
// Plan 8b Task 3 — Tests for auto-run compliance review triggered from
// TASK_START_TURN when compliance_review_enabled = true.
//
// Uses the same FakeIpcMain + Container pattern as task_handlers.spec.ts.
// Mocks the AgentPort (used by ComplianceReviewer) and the clipboard.
// The test verifies:
//   - task with compliance_review_enabled=true + outputMode='file'  → reviewer called
//   - task with compliance_review_enabled=true + outputMode='clipboard' → clipboard.writeText called
//   - task with compliance_review_enabled=true + outputMode='off'   → reviewer NOT called
//   - task with compliance_review_enabled=false (or unset)           → reviewer NOT called

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Container } from '../../../src/main/container';
import { PORT } from '../../../src/main/composition_root';
import { CH } from '../../../src/main/ipc/channels';
import { registerIpcHandlers } from '../../../src/main/ipc/handlers';
import { TaskService } from '../../../src/main/services/task_service';
import type { MasterChatController, MasterChatResult, MasterChatTurn } from '../../../src/main/services/master_chat_controller';
import type { MethodologyPort, LoadMethodologyResult } from '../../../src/core/ports/methodology_port';
import type { Methodology } from '../../../src/core/domain/methodology';
import type { AgentMessage } from '../../../src/core/domain/agent';
import type { SettingsPort } from '../../../src/core/ports/settings_port';
import type { AgentPort, AgentSession } from '../../../src/core/ports/agent_port';
import type { UserSettings } from '../../../src/core/domain/settings';
import { defaultUserSettings } from '../../../src/core/domain/settings';

// Mock atomicWrite so we can verify when a file write happens (or doesn't).
vi.mock('../../../src/core/infrastructure/atomic_write', () => ({
  atomicWrite: vi.fn().mockResolvedValue(undefined),
}));
import { atomicWrite } from '../../../src/core/infrastructure/atomic_write';

// Mock node:fs so mkdir calls in the compliance reviewer don't hit the real FS.
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

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
        contract: { input: [], output: { path: 'out.md' } },
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

function makeSettingsMock(overrides: Partial<UserSettings> = {}): SettingsPort {
  const user: UserSettings = { ...defaultUserSettings(), ...overrides };
  return {
    getUserSettings: vi.fn().mockResolvedValue(user),
    setUserSettings: vi.fn().mockResolvedValue(undefined),
    getProjectSettings: vi.fn().mockResolvedValue({}),
    setProjectSettings: vi.fn().mockResolvedValue(undefined),
  };
}

/** Stub AgentPort that immediately delivers one agent message and resolves. */
function makeAgentStub(): { port: AgentPort; reviewCallCount: () => number } {
  let callCount = 0;
  const port: AgentPort = {
    providerId: 'stub',
    health: vi.fn().mockResolvedValue({ ok: true as const }),
    startSession: vi.fn().mockImplementation(async () => {
      callCount += 1;
      const listeners: Array<(m: AgentMessage) => void> = [];
      const session: AgentSession = {
        id: { value: `session-${callCount}` },
        onMessage: (cb) => {
          listeners.push(cb);
          return () => {};
        },
        send: vi.fn().mockImplementation(async () => {
          for (const l of listeners) {
            l({ id: 'a1', role: 'agent', text: '# COMPLIANT\n', timestamp: new Date().toISOString() });
          }
        }),
        awaitTurn: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      return session;
    }),
  };
  return { port, reviewCallCount: () => callCount };
}

function buildContainer(opts: {
  taskService: TaskService;
  masterChat: MasterChatController;
  methodology: MethodologyPort;
  settings: SettingsPort;
  agent?: AgentPort;
}): Container {
  const c = new Container();
  c.register(PORT.project, {
    listRecent: vi.fn(),
    addProject: vi.fn(),
    open: vi.fn(),
    removeFromRecent: vi.fn(),
    get: vi.fn(),
  } as never);
  c.register(PORT.settings, opts.settings);
  c.register(PORT.methodology, opts.methodology);
  c.register(PORT.task, opts.taskService);
  c.register(PORT.masterChat, opts.masterChat);
  c.register(PORT.files, {
    readDir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
  } as never);
  if (opts.agent) {
    c.register(PORT.agent, opts.agent);
  }
  return c;
}

/** Pause the promise queue so fire-and-forget async chains can flush. */
async function flushAsync(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 10));
  await new Promise<void>((r) => setTimeout(r, 10));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Stub require('electron') so clipboard calls in the auto-run helper don't
// throw. We override the mock in individual tests via vi.spyOn if needed.
vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
}));

describe('compliance auto-run on task completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMasterChat(): MasterChatController {
    return {
      runTurn: vi.fn().mockImplementation(
        async (_turn: MasterChatTurn, onMessage?: (m: AgentMessage) => void) => {
          if (onMessage) {
            onMessage({ id: 'a1', role: 'agent', text: 'ok', timestamp: new Date().toISOString() });
          }
          return {
            workerOutput: [],
            translatedText: '',
            cost: null,
            tokens: { input: 5, output: 5 },
          } satisfies MasterChatResult;
        },
      ),
    } as unknown as MasterChatController;
  }

  test('compliance_review_enabled=true + outputMode=file → reviewer runs', async () => {
    const { port: agent, reviewCallCount } = makeAgentStub();
    const taskService = new TaskService();
    const fakeIpc = makeFakeIpcMain();
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: fixtureMethodology(),
      warnings: [],
    });
    const settings = makeSettingsMock({ complianceOutputMode: 'file' });
    const c = buildContainer({
      taskService,
      masterChat: makeMasterChat(),
      methodology,
      settings,
      agent,
    });
    registerIpcHandlers(c, fakeIpc as never);

    // Create task with compliance_review_enabled=true.
    const task = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
      compliance_review_enabled: true,
    })) as { id: string };

    // Run a turn to trigger the done path.
    await fakeIpc.invoke(CH.TASK_START_TURN, {
      taskId: task.id,
      projectPath: '/proj',
      userMessage: 'go',
    });

    // Allow the fire-and-forget chain to flush.
    await flushAsync();

    expect(reviewCallCount()).toBeGreaterThanOrEqual(1);
  });

  test('compliance_review_enabled=true + outputMode=off → reviewer NOT called', async () => {
    const { port: agent, reviewCallCount } = makeAgentStub();
    const taskService = new TaskService();
    const fakeIpc = makeFakeIpcMain();
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: fixtureMethodology(),
      warnings: [],
    });
    const settings = makeSettingsMock({ complianceOutputMode: 'off' });
    const c = buildContainer({
      taskService,
      masterChat: makeMasterChat(),
      methodology,
      settings,
      agent,
    });
    registerIpcHandlers(c, fakeIpc as never);

    const task = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
      compliance_review_enabled: true,
    })) as { id: string };

    await fakeIpc.invoke(CH.TASK_START_TURN, {
      taskId: task.id,
      projectPath: '/proj',
      userMessage: 'go',
    });

    await flushAsync();

    // outputMode='off' → reviewer must not have been called.
    expect(reviewCallCount()).toBe(0);
  });

  test('compliance_review_enabled=false → reviewer NOT called', async () => {
    const { port: agent, reviewCallCount } = makeAgentStub();
    const taskService = new TaskService();
    const fakeIpc = makeFakeIpcMain();
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: fixtureMethodology(),
      warnings: [],
    });
    const settings = makeSettingsMock({ complianceOutputMode: 'file' });
    const c = buildContainer({
      taskService,
      masterChat: makeMasterChat(),
      methodology,
      settings,
      agent,
    });
    registerIpcHandlers(c, fakeIpc as never);

    const task = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
      compliance_review_enabled: false,
    })) as { id: string };

    await fakeIpc.invoke(CH.TASK_START_TURN, {
      taskId: task.id,
      projectPath: '/proj',
      userMessage: 'go',
    });

    await flushAsync();

    expect(reviewCallCount()).toBe(0);
  });

  test('compliance_review_enabled unset (default false) → reviewer NOT called', async () => {
    const { port: agent, reviewCallCount } = makeAgentStub();
    const taskService = new TaskService();
    const fakeIpc = makeFakeIpcMain();
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: fixtureMethodology(),
      warnings: [],
    });
    const settings = makeSettingsMock({ complianceOutputMode: 'file' });
    const c = buildContainer({
      taskService,
      masterChat: makeMasterChat(),
      methodology,
      settings,
      agent,
    });
    registerIpcHandlers(c, fakeIpc as never);

    // No compliance_review_enabled field at all.
    const task = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
    })) as { id: string };

    await fakeIpc.invoke(CH.TASK_START_TURN, {
      taskId: task.id,
      projectPath: '/proj',
      userMessage: 'go',
    });

    await flushAsync();

    expect(reviewCallCount()).toBe(0);
  });

  test('compliance_review_enabled=true + outputMode=clipboard → clipboard.writeText called, file NOT written', async () => {
    vi.mocked(atomicWrite).mockClear();
    const clipboardSpy = vi.fn<(text: string) => void>();

    const { port: agent, reviewCallCount } = makeAgentStub();
    const taskService = new TaskService();
    const fakeIpc = makeFakeIpcMain();
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: fixtureMethodology(),
      warnings: [],
    });
    const settings = makeSettingsMock({ complianceOutputMode: 'clipboard' });
    const c = buildContainer({
      taskService,
      masterChat: makeMasterChat(),
      methodology,
      settings,
      agent,
    });
    registerIpcHandlers(c, fakeIpc as never, { clipboardWrite: clipboardSpy });

    const task = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
      compliance_review_enabled: true,
    })) as { id: string };

    await fakeIpc.invoke(CH.TASK_START_TURN, {
      taskId: task.id,
      projectPath: '/proj',
      userMessage: 'go',
    });

    await flushAsync();

    // Reviewer agent must have been called (reviewContent path).
    expect(reviewCallCount()).toBeGreaterThanOrEqual(1);
    // Clipboard must have received the content.
    expect(clipboardSpy).toHaveBeenCalledTimes(1);
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('COMPLIANT'));
    // atomicWrite must NOT have been called (no file written for clipboard mode).
    expect(vi.mocked(atomicWrite)).not.toHaveBeenCalled();
  });

  test('compliance_review_enabled=true + outputMode=both → clipboard.writeText called AND file written', async () => {
    vi.mocked(atomicWrite).mockClear();
    const clipboardSpy = vi.fn<(text: string) => void>();

    const { port: agent, reviewCallCount } = makeAgentStub();
    const taskService = new TaskService();
    const fakeIpc = makeFakeIpcMain();
    const methodology = makeMethodologyMock({
      ok: true,
      methodology: fixtureMethodology(),
      warnings: [],
    });
    const settings = makeSettingsMock({ complianceOutputMode: 'both' });
    const c = buildContainer({
      taskService,
      masterChat: makeMasterChat(),
      methodology,
      settings,
      agent,
    });
    registerIpcHandlers(c, fakeIpc as never, { clipboardWrite: clipboardSpy });

    const task = (await fakeIpc.invoke(CH.TASK_CREATE, {
      methodologyId: 'lite',
      stageId: 's1',
      compliance_review_enabled: true,
    })) as { id: string };

    await fakeIpc.invoke(CH.TASK_START_TURN, {
      taskId: task.id,
      projectPath: '/proj',
      userMessage: 'go',
    });

    await flushAsync();

    // Reviewer agent must have been called.
    expect(reviewCallCount()).toBeGreaterThanOrEqual(1);
    // Clipboard must have received the content.
    expect(clipboardSpy).toHaveBeenCalledTimes(1);
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('COMPLIANT'));
    // atomicWrite must have been called (file written for 'both' mode).
    expect(vi.mocked(atomicWrite)).toHaveBeenCalledTimes(1);
  });
});
