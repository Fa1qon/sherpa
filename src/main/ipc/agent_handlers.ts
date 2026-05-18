import type { IpcMain } from 'electron';
import { CH } from './channels';
import type { AgentAuthService } from '../services/agent_auth_service';
import type { AgentRegistry } from '../services/agent_registry';
import type { AgentCli } from '../../core/domain/settings';

export function registerAgentHandlers(
  authService: AgentAuthService,
  registry: AgentRegistry,
): void {
  // Lazy require so this module loads in vitest (where electron is unavailable).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as { ipcMain: IpcMain | undefined };
  const ipcMain = electron.ipcMain;
  // Guard: no-op when electron is not available (e.g. in vitest).
  if (!ipcMain) return;

  ipcMain.handle(CH.AGENT_STORE_KEY, async (_event, agentId: AgentCli, apiKey: string) => {
    try {
      await authService.storeApiKey(agentId, apiKey);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String(err) };
    }
  });

  ipcMain.handle(CH.AGENT_AUTH_REVOKE, async (_event, agentId: AgentCli) => {
    try {
      await authService.revokeCredential(agentId);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: String(err) };
    }
  });

  ipcMain.handle(CH.AGENT_AUTH_STATUS, async (_event, agentId: AgentCli) => {
    const cred = await authService.getCredential(agentId);
    if (!cred) return { hasCredential: false };
    return { hasCredential: true, type: cred.type };
  });

  ipcMain.handle(CH.AGENT_HEALTH, async (_event, agentId: AgentCli) => {
    try {
      return await registry.health(agentId);
    } catch (err) {
      return { ok: false as const, reason: String(err) };
    }
  });
}
