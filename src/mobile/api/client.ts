const TOKEN_KEY = 'sherpa.mobile.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function req(path: string, init?: RequestInit): Promise<unknown> {
  const token = getToken();
  const r = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (r.status === 401) {
    clearToken();
    throw new Error('Unauthorized');
  }
  let body: unknown = null;
  try { body = await r.json(); } catch { /* leave body as null */ }
  if (!r.ok) {
    const err = (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string')
      ? (body as { error: string }).error
      : `HTTP ${r.status}`;
    throw new Error(err);
  }
  return body;
}

export interface MobileTask {
  id: string;
  title: string;
  status: string;
  hasPendingGate?: boolean;
}

export interface MobileGate {
  id: string;
  description?: string;
  stageId?: string;
  createdAt?: number;
}

export const api = {
  login: (pin: string) =>
    req('/api/login', { method: 'POST', body: JSON.stringify({ pin }) }) as Promise<{ ok: boolean; token: string }>,
  listTasks: () =>
    req('/api/tasks') as Promise<{ ok: boolean; tasks: MobileTask[] }>,
  getTask: (id: string) =>
    req(`/api/tasks/${id}`) as Promise<{ ok: boolean; task: unknown }>,
  listGates: (id: string) =>
    req(`/api/tasks/${id}/gates`) as Promise<{ ok: boolean; gates: MobileGate[] }>,
  approve: (taskId: string, gateId: string, reason?: string) =>
    req(`/api/tasks/${taskId}/gates/${gateId}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }) as Promise<{ ok: boolean }>,
  reject: (taskId: string, gateId: string, reason?: string) =>
    req(`/api/tasks/${taskId}/gates/${gateId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }) as Promise<{ ok: boolean }>,
};
