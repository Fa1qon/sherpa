import type { BrowserWindow } from 'electron';
import type { BrowserMode } from '../../core/domain/browser';
import { HeadlessBackend } from './browser/headless_backend';
import { EmbeddedBackend } from './browser/embedded_backend';
import { BrowserSession } from './browser/browser_session';

export class BrowserService {
  private sessions = new Map<string, BrowserSession>();

  async createSession(
    taskId: string,
    mode: BrowserMode,
    mainWindow: BrowserWindow | null,
  ): Promise<BrowserSession> {
    const existing = this.sessions.get(taskId);
    if (existing) {
      await existing.close();
      this.sessions.delete(taskId);
    }

    let session: BrowserSession;
    if (mode === 'headless') {
      const backend = new HeadlessBackend(taskId);
      await backend.init();
      session = new BrowserSession(taskId, 'headless', backend);
    } else {
      if (!mainWindow) throw new Error('mainWindow required for embedded mode');
      const backend = new EmbeddedBackend(taskId, mainWindow);
      await backend.init();
      session = new BrowserSession(taskId, 'embedded', backend);
    }

    this.sessions.set(taskId, session);
    return session;
  }

  getSession(taskId: string): BrowserSession | undefined {
    return this.sessions.get(taskId);
  }

  async closeSession(taskId: string): Promise<void> {
    const session = this.sessions.get(taskId);
    if (session) {
      await session.close();
      this.sessions.delete(taskId);
    }
  }

  async closeAll(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.closeSession(id);
    }
  }
}
