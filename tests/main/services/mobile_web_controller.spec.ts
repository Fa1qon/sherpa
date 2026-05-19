import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MobileWebController } from '../../../src/main/services/mobile_web_controller.js';
import { TaskService } from '../../../src/main/services/task_service.js';
import {
  GateEvaluator,
  type FileSystemPort,
  type MetaMdStore,
  type ReviewerOutcomeStore,
  type TaskMeta,
} from '../../../src/main/services/gate_evaluator.js';
import type { SettingsPort } from '../../../src/core/ports/settings_port.js';
import {
  defaultUserSettings,
  defaultProjectSettings,
  type UserSettings,
  type ProjectSettings,
} from '../../../src/core/domain/settings.js';

vi.setConfig({ testTimeout: 10_000 });

const fsPort: FileSystemPort = {
  listFilesRecursive: async () => [] as readonly string[],
};
const metaStore: MetaMdStore = {
  load: async (): Promise<TaskMeta> => ({ counters: {} } as TaskMeta),
};
const reviewerOutcomes: ReviewerOutcomeStore = {
  getPassedReviewers: async () => [] as readonly string[],
};

class FakeSettings implements SettingsPort {
  constructor(public user: UserSettings) {}
  getUserSettings = async (): Promise<UserSettings> => this.user;
  setUserSettings = async (s: UserSettings): Promise<void> => { this.user = s; };
  getProjectSettings = async (): Promise<ProjectSettings> => defaultProjectSettings();
  setProjectSettings = async (): Promise<void> => undefined;
}

async function makeStaticDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-web-static-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><html></html>', 'utf8');
  return dir;
}

interface Harness {
  controller: MobileWebController;
  settings: FakeSettings;
  staticDir: string;
}

function buildHarness(mobileWeb: UserSettings['mobileWeb']): Harness {
  const base = defaultUserSettings();
  const user: UserSettings = mobileWeb === undefined ? base : { ...base, mobileWeb };
  const settings = new FakeSettings(user);
  return {
    settings,
    controller: null as unknown as MobileWebController,
    staticDir: '',
  };
}

describe('MobileWebController', () => {
  let staticDir: string;
  let controllers: MobileWebController[] = [];

  beforeEach(async () => {
    staticDir = await makeStaticDir();
    controllers = [];
  });

  afterEach(async () => {
    for (const c of controllers) {
      try { await c.stop(); } catch { /* ignore */ }
    }
    await fs.rm(staticDir, { recursive: true, force: true });
  });

  function buildController(mobileWeb: UserSettings['mobileWeb']): {
    controller: MobileWebController;
    settings: FakeSettings;
  } {
    const { settings } = buildHarness(mobileWeb);
    const taskService = new TaskService();
    const gateEvaluator = new GateEvaluator(fsPort, metaStore, reviewerOutcomes);
    const controller = new MobileWebController({
      settings,
      taskService,
      gateEvaluator,
      staticDir,
    });
    controllers.push(controller);
    return { controller, settings };
  }

  it('startIfEnabled with mobileWeb.enabled=false does not start the server', async () => {
    const { controller } = buildController({ enabled: false, port: 0 });
    await controller.startIfEnabled();
    expect(controller.getStatus().running).toBe(false);
  });

  it('startIfEnabled with enabled=true + port=0 + custom PIN serves /api/login', async () => {
    const { controller } = buildController({ enabled: true, port: 0, pin: '1234' });
    await controller.startIfEnabled();
    const status = controller.getStatus();
    expect(status.running).toBe(true);
    expect(typeof status.port).toBe('number');
    expect(status.port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${status.port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token?: string };
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe('string');
    expect((body.token as string).length).toBeGreaterThan(0);
  });

  it('restart re-applies a PIN that was updated in settings', async () => {
    const { controller, settings } = buildController({ enabled: true, port: 0, pin: '1234' });
    await controller.startIfEnabled();
    const portBefore = controller.getStatus().port!;
    expect(portBefore).toBeGreaterThan(0);

    // Caller updates settings PIN, then restarts. Old PIN must be rejected,
    // new one accepted on the freshly-bound port.
    settings.user = { ...settings.user, mobileWeb: { enabled: true, port: 0, pin: '5678' } };
    await controller.restart();

    const status = controller.getStatus();
    expect(status.running).toBe(true);
    const port = status.port!;

    const bad = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });
    expect(bad.status).toBe(401);

    const good = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '5678' }),
    });
    expect(good.status).toBe(200);
  });

  it('setPin after start swaps the active PIN without restart', async () => {
    const { controller } = buildController({ enabled: true, port: 0, pin: '1234' });
    await controller.startIfEnabled();
    const port = controller.getStatus().port!;

    controller.setPin('9999');

    // Old PIN now rejected.
    const bad = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });
    expect(bad.status).toBe(401);

    // New PIN accepted.
    const good = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });
    expect(good.status).toBe(200);
  });

  it('concurrent startIfEnabled calls share one promise and produce a single running port', async () => {
    const { controller } = buildController({ enabled: true, port: 0, pin: '1234' });
    await expect(
      Promise.all([controller.startIfEnabled(), controller.startIfEnabled()]),
    ).resolves.toEqual([undefined, undefined]);
    const status = controller.getStatus();
    expect(status.running).toBe(true);
    expect(typeof status.port).toBe('number');
    expect(status.port).toBeGreaterThan(0);

    // Confirm the single bound port answers /api/login.
    const res = await fetch(`http://127.0.0.1:${status.port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });
    expect(res.status).toBe(200);
  });

  it('stop shuts down the server; subsequent fetch fails', async () => {
    const { controller } = buildController({ enabled: true, port: 0, pin: '1234' });
    await controller.startIfEnabled();
    const port = controller.getStatus().port!;

    await controller.stop();
    expect(controller.getStatus().running).toBe(false);

    await expect(
      fetch(`http://127.0.0.1:${port}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      }),
    ).rejects.toBeDefined();
  });
});
