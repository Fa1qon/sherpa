import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalWebServer } from '../../../src/main/services/local_web_server.js';
import { MobileAuth } from '../../../src/main/services/mobile_auth.js';
import { TaskService } from '../../../src/main/services/task_service.js';
import {
  GateEvaluator,
  type FileSystemPort,
  type MetaMdStore,
  type ReviewerOutcomeStore,
  type TaskMeta,
} from '../../../src/main/services/gate_evaluator.js';
import { createMobileApiHandler } from '../../../src/main/services/mobile_api_handlers.js';

vi.setConfig({ testTimeout: 10_000 });

const PIN = '4287';

const fsPort: FileSystemPort = {
  listFilesRecursive: async () => [] as readonly string[],
};
const metaStore: MetaMdStore = {
  load: async (): Promise<TaskMeta> => ({ counters: {} } as TaskMeta),
};
const reviewerOutcomes: ReviewerOutcomeStore = {
  getPassedReviewers: async () => [] as readonly string[],
};

async function makeStaticDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-api-static-'));
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><html></html>', 'utf8');
  return dir;
}

interface Harness {
  server: LocalWebServer;
  port: number;
  staticDir: string;
  auth: MobileAuth;
  taskService: TaskService;
  gateEvaluator: GateEvaluator;
}

async function boot(): Promise<Harness> {
  const server = new LocalWebServer();
  const staticDir = await makeStaticDir();
  const auth = new MobileAuth(PIN);
  const taskService = new TaskService();
  const gateEvaluator = new GateEvaluator(fsPort, metaStore, reviewerOutcomes);
  const handler = createMobileApiHandler({ auth, taskService, gateEvaluator });
  const { port } = await server.start({
    port: 0,
    host: '127.0.0.1',
    staticDir,
    apiHandler: handler,
  });
  return { server, port, staticDir, auth, taskService, gateEvaluator };
}

async function jsonPost(url: string, body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function jsonGet(url: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  return fetch(url, { headers });
}

describe('createMobileApiHandler', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await boot();
  });

  afterEach(async () => {
    try { await h.server.stop(); } catch { /* ignore */ }
    await fs.rm(h.staticDir, { recursive: true, force: true });
  });

  it('POST /api/login with correct PIN returns token', async () => {
    const res = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe('string');
    expect((body.token as string).length).toBeGreaterThan(0);
  });

  it('POST /api/login with wrong PIN returns 401', async () => {
    const res = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: '0000' });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'Bad PIN' });
  });

  it('GET /api/tasks without Authorization returns 401', async () => {
    const res = await jsonGet(`http://127.0.0.1:${h.port}/api/tasks`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('GET /api/tasks with valid token returns seeded task with hasPendingGate=false', async () => {
    const task = h.taskService.createTask({ title: 'Seed task' });
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonGet(`http://127.0.0.1:${h.port}/api/tasks`, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.tasks)).toBe(true);
    const found = body.tasks.find((t: { id: string }) => t.id === task.id);
    expect(found).toBeDefined();
    expect(found.hasPendingGate).toBe(false);
    expect(found.title).toBe('Seed task');
  });

  it('GET /api/tasks reflects setPending → hasPendingGate=true', async () => {
    const task = h.taskService.createTask({ title: 'With pending gate' });
    h.gateEvaluator.setPending(task.id, { id: 'g1', createdAt: Date.now() });
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonGet(`http://127.0.0.1:${h.port}/api/tasks`, token);
    const body = await res.json();
    const found = body.tasks.find((t: { id: string }) => t.id === task.id);
    expect(found.hasPendingGate).toBe(true);
  });

  it('GET /api/tasks/:id returns task object', async () => {
    const task = h.taskService.createTask({ title: 'Detail target' });
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonGet(`http://127.0.0.1:${h.port}/api/tasks/${task.id}`, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.task.id).toBe(task.id);
    expect(body.task.title).toBe('Detail target');
  });

  it('GET /api/tasks/UNKNOWN returns 404', async () => {
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonGet(`http://127.0.0.1:${h.port}/api/tasks/UNKNOWN`, token);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'Not found' });
  });

  it('GET /api/tasks/:id/gates returns pending gates list', async () => {
    const task = h.taskService.createTask({ title: 'gates' });
    h.gateEvaluator.setPending(task.id, { id: 'g1', createdAt: 12345 });
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonGet(`http://127.0.0.1:${h.port}/api/tasks/${task.id}/gates`, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.gates).toHaveLength(1);
    expect(body.gates[0].id).toBe('g1');
  });

  it('POST /api/tasks/:id/gates/:gateId/approve resolves with status=pass', async () => {
    const task = h.taskService.createTask({ title: 'approve' });
    h.gateEvaluator.setPending(task.id, { id: 'g1', createdAt: Date.now() });
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonPost(
      `http://127.0.0.1:${h.port}/api/tasks/${task.id}/gates/g1/approve`,
      { reason: 'looks good' },
      token,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const remaining = await h.gateEvaluator.listPending(task.id);
    expect(remaining).toHaveLength(0);

    const resolutions = h.gateEvaluator.getResolutions();
    const last = resolutions[resolutions.length - 1];
    expect(last.taskId).toBe(task.id);
    expect(last.gateId).toBe('g1');
    expect(last.resolution.status).toBe('pass');
    expect(last.resolution.reason).toBe('looks good');
  });

  it('POST /api/tasks/:id/gates/:gateId/reject resolves with status=fail and reason', async () => {
    const task = h.taskService.createTask({ title: 'reject' });
    h.gateEvaluator.setPending(task.id, { id: 'g1', createdAt: Date.now() });
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonPost(
      `http://127.0.0.1:${h.port}/api/tasks/${task.id}/gates/g1/reject`,
      { reason: 'nope' },
      token,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const resolutions = h.gateEvaluator.getResolutions();
    const last = resolutions[resolutions.length - 1];
    expect(last.resolution.status).toBe('fail');
    expect(last.resolution.reason).toBe('nope');
  });

  it('POST approve for non-existent gate returns 404 and does not record a resolution', async () => {
    const task = h.taskService.createTask({ title: 'approve-miss' });
    // Seed an unrelated pending gate to make sure the list-exists branch is also covered.
    h.gateEvaluator.setPending(task.id, { id: 'g-real', createdAt: Date.now() });
    const before = h.gateEvaluator.getResolutions().length;
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    // Wrong gateId on a known task.
    const res1 = await jsonPost(
      `http://127.0.0.1:${h.port}/api/tasks/${task.id}/gates/g-missing/approve`,
      {},
      token,
    );
    expect(res1.status).toBe(404);
    const body1 = await res1.json();
    expect(body1).toEqual({ ok: false, error: 'Gate not found' });

    // Unknown taskId.
    const res2 = await jsonPost(
      `http://127.0.0.1:${h.port}/api/tasks/UNKNOWN/gates/g1/approve`,
      {},
      token,
    );
    expect(res2.status).toBe(404);
    expect(await res2.json()).toEqual({ ok: false, error: 'Gate not found' });

    expect(h.gateEvaluator.getResolutions().length).toBe(before);
  });

  it('POST reject for unknown gateId returns 404', async () => {
    const task = h.taskService.createTask({ title: 'reject-miss' });
    const before = h.gateEvaluator.getResolutions().length;
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonPost(
      `http://127.0.0.1:${h.port}/api/tasks/${task.id}/gates/g-missing/reject`,
      { reason: 'nope' },
      token,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'Gate not found' });
    expect(h.gateEvaluator.getResolutions().length).toBe(before);
  });

  it('POST /api/wat returns 404', async () => {
    const login = await jsonPost(`http://127.0.0.1:${h.port}/api/login`, { pin: PIN });
    const { token } = await login.json();

    const res = await jsonPost(`http://127.0.0.1:${h.port}/api/wat`, {}, token);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'Route not found' });
  });
});
