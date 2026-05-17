import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Container } from '../../../src/main/container';
import { PORT } from '../../../src/main/composition_root';
import { CH } from '../../../src/main/ipc/channels';
import { registerIpcHandlers } from '../../../src/main/ipc/handlers';
import type { MethodologyPort } from '../../../src/core/ports/methodology_port';

interface FakeIpcMain {
  handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
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
  };
}

describe('methodology IPC handlers', () => {
  let c: Container;
  let methodologyMock: MethodologyPort;
  let fakeIpc: FakeIpcMain;

  beforeEach(() => {
    methodologyMock = {
      list: vi.fn().mockResolvedValue([]),
      load: vi.fn().mockResolvedValue({ ok: false, error: { kind: 'not-found' } }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    c = new Container();
    c.register(PORT.project, {
      listRecent: vi.fn(),
      addProject: vi.fn(),
      open: vi.fn(),
      removeFromRecent: vi.fn(),
      get: vi.fn(),
    } as never);
    c.register(PORT.settings, {
      getUserSettings: vi.fn(),
      setUserSettings: vi.fn(),
      getProjectSettings: vi.fn(),
      setProjectSettings: vi.fn(),
    } as never);
    c.register(PORT.methodology, methodologyMock);
    c.register(PORT.task, {
      createTask: vi.fn(),
      getTask: vi.fn(),
      listTasks: vi.fn(),
      appendMessages: vi.fn(),
    } as never);
    c.register(PORT.masterChat, { runTurn: vi.fn() } as never);
    c.register(PORT.files, {
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(''),
    } as never);
    fakeIpc = makeFakeIpcMain();
  });

  test('METHODOLOGY_LIST delegates to port', async () => {
    registerIpcHandlers(c, fakeIpc as never);
    await fakeIpc.invoke(CH.METHODOLOGY_LIST, '/p');
    expect(methodologyMock.list).toHaveBeenCalledWith('/p');
  });

  test('METHODOLOGY_LOAD passes id', async () => {
    registerIpcHandlers(c, fakeIpc as never);
    await fakeIpc.invoke(CH.METHODOLOGY_LOAD, '/p', 'lite');
    expect(methodologyMock.load).toHaveBeenCalledWith('/p', 'lite');
  });
});
