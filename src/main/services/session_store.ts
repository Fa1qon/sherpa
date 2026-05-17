// src/main/services/session_store.ts
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { atomicWrite } from '../../core/infrastructure/atomic_write';

export interface SessionData {
  readonly activeTaskId: string | null;
  readonly leftActivity?: string | null;
  readonly leftWidth?: number;
  readonly rightOpen?: boolean;
  readonly rightWidth?: number;
  readonly rightCollapsed?: string[];
  readonly bottomOpen?: boolean;
  readonly bottomHeight?: number;
}

function defaultSession(): SessionData {
  return { activeTaskId: null };
}

function isSessionData(v: unknown): v is SessionData {
  return (
    typeof v === 'object' &&
    v !== null &&
    'activeTaskId' in v &&
    (typeof (v as Record<string, unknown>).activeTaskId === 'string' ||
      (v as Record<string, unknown>).activeTaskId === null)
  );
}

export class SessionStore {
  async getSession(projectPath: string): Promise<SessionData> {
    const file = this.sessionPath(projectPath);
    try {
      const raw = await fsp.readFile(file, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isSessionData(parsed) ? parsed : defaultSession();
    } catch {
      return defaultSession();
    }
  }

  async setSession(projectPath: string, data: SessionData): Promise<void> {
    const file = this.sessionPath(projectPath);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await atomicWrite(file, JSON.stringify(data, null, 2));
  }

  private sessionPath(projectPath: string): string {
    return path.join(projectPath, '.sherpa', 'session.json');
  }
}
