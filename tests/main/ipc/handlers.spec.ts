import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Container } from '../../../src/main/container';
import { PORT } from '../../../src/main/composition_root';
import { CH } from '../../../src/main/ipc/channels';
import { registerIpcHandlers } from '../../../src/main/ipc/handlers';
import type { ProjectPort } from '../../../src/core/ports/project_port';
import type { SettingsPort } from '../../../src/core/ports/settings_port';
import type { MethodologyPort } from '../../../src/core/ports/methodology_port';
import { defaultUserSettings, defaultProjectSettings } from '../../../src/core/domain/settings';

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

describe('registerIpcHandlers', () => {
  let c: Container;
  let projectMock: ProjectPort;
  let settingsMock: SettingsPort;
  let methodologyMock: MethodologyPort;
  let fakeIpc: FakeIpcMain;

  beforeEach(() => {
    projectMock = {
      listRecent: vi.fn().mockResolvedValue([]),
      addProject: vi.fn().mockResolvedValue({
        ok: true,
        project: {
          id: 'p1',
          name: 'p',
          path: '/p',
          addedAt: 'now',
          lastOpenedAt: 'now',
        },
      }),
      open: vi.fn().mockResolvedValue(null),
      removeFromRecent: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
    };
    settingsMock = {
      getUserSettings: vi.fn().mockResolvedValue(defaultUserSettings()),
      setUserSettings: vi.fn().mockResolvedValue(undefined),
      getProjectSettings: vi.fn().mockResolvedValue(defaultProjectSettings()),
      setProjectSettings: vi.fn().mockResolvedValue(undefined),
    };

    methodologyMock = {
      list: vi.fn().mockResolvedValue([]),
      load: vi.fn().mockResolvedValue({ ok: false, error: { kind: 'not-found' } }),
      save: vi.fn().mockResolvedValue(undefined),
    };

    c = new Container();
    c.register(PORT.project, projectMock);
    c.register(PORT.settings, settingsMock);
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

  test('PROJECT_LIST_RECENT delegates to projectPort', async () => {
    registerIpcHandlers(c, fakeIpc as never);
    await fakeIpc.invoke(CH.PROJECT_LIST_RECENT);
    expect(projectMock.listRecent).toHaveBeenCalledOnce();
  });

  test('PROJECT_ADD passes options through', async () => {
    registerIpcHandlers(c, fakeIpc as never);
    await fakeIpc.invoke(CH.PROJECT_ADD, { path: '/p', scaffold: true });
    expect(projectMock.addProject).toHaveBeenCalledWith({ path: '/p', scaffold: true });
  });

  test('SETTINGS_SET_USER passes settings through', async () => {
    registerIpcHandlers(c, fakeIpc as never);
    const s = defaultUserSettings();
    await fakeIpc.invoke(CH.SETTINGS_SET_USER, s);
    expect(settingsMock.setUserSettings).toHaveBeenCalledWith(s);
  });
});
