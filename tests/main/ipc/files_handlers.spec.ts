// tests/main/ipc/files_handlers.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Container } from '../../../src/main/container';
import { PORT } from '../../../src/main/composition_root';
import { CH } from '../../../src/main/ipc/channels';
import { registerIpcHandlers } from '../../../src/main/ipc/handlers';
import type { FilesPort, DirEntry } from '../../../src/core/ports/files_port';

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

function buildContainer(filesMock: FilesPort): Container {
  const c = new Container();
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
  c.register(PORT.methodology, {
    list: vi.fn().mockResolvedValue([]),
    load: vi.fn().mockResolvedValue({ ok: false, error: { kind: 'not-found' } }),
    save: vi.fn().mockResolvedValue(undefined),
  } as never);
  c.register(PORT.task, {
    createTask: vi.fn(),
    getTask: vi.fn(),
    listTasks: vi.fn(),
    appendMessages: vi.fn(),
  } as never);
  c.register(PORT.masterChat, { runTurn: vi.fn() } as never);
  c.register(PORT.files, filesMock);
  return c;
}

describe('files IPC handlers', () => {
  let filesMock: FilesPort;
  let fakeIpc: FakeIpcMain;

  beforeEach(() => {
    filesMock = {
      readDir: vi.fn().mockResolvedValue([
        { name: 'foo.ts', relPath: 'src/foo.ts', kind: 'file' } as DirEntry,
      ]),
      readFile: vi.fn().mockResolvedValue('file content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readBinary: vi.fn().mockResolvedValue('base64data'),
    };
    fakeIpc = makeFakeIpcMain();
  });

  test('FILES_READ_DIR routes through to FilesPort.readDir', async () => {
    const c = buildContainer(filesMock);
    registerIpcHandlers(c, fakeIpc as never);

    const result = (await fakeIpc.invoke(
      CH.FILES_READ_DIR,
      '/project',
      'src',
    )) as DirEntry[];

    expect(filesMock.readDir).toHaveBeenCalledWith('/project', 'src');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('foo.ts');
    expect(result[0]!.relPath).toBe('src/foo.ts');
    expect(result[0]!.kind).toBe('file');
  });

  test('FILES_READ_FILE routes through to FilesPort.readFile', async () => {
    const c = buildContainer(filesMock);
    registerIpcHandlers(c, fakeIpc as never);

    const result = (await fakeIpc.invoke(
      CH.FILES_READ_FILE,
      '/project',
      'readme.md',
    )) as string;

    expect(filesMock.readFile).toHaveBeenCalledWith('/project', 'readme.md');
    expect(result).toBe('file content');
  });

  test('FILES_READ_DIR propagates rejection from FilesPort', async () => {
    filesMock.readDir = vi.fn().mockRejectedValue(new Error('escapes project root'));
    const c = buildContainer(filesMock);
    registerIpcHandlers(c, fakeIpc as never);

    await expect(
      fakeIpc.invoke(CH.FILES_READ_DIR, '/project', '../outside'),
    ).rejects.toThrow('escapes project root');
  });
});
