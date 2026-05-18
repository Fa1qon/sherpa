// src/renderer/store/settings.ts
import { create } from 'zustand';
import type { UserSettings, ProjectSettings, Theme, Language, CostTrackingSettings, ComplianceOutputMode, AgentCli } from '../../core/domain/settings';
import { defaultUserSettings } from '../../core/domain/settings';
import type { ProxyEntry, ProxyAssignments } from '../../core/domain/proxy';
import { ipcClient } from '../ipc/client';

export interface SettingsState {
  user: UserSettings;
  loaded: boolean;
  projectSettings: ProjectSettings | null;
  load(): Promise<void>;
  loadProject(projectPath: string): Promise<void>;
  saveProject(projectPath: string, s: ProjectSettings): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  setLanguage(language: Language): Promise<void>;
  setDefaultAgentCli(cli: UserSettings['defaultAgentCli']): Promise<void>;
  setCostTracking(c: CostTrackingSettings): Promise<void>;
  setComplianceOutputMode(mode: ComplianceOutputMode): Promise<void>;
  setShowEventLog(show: boolean): Promise<void>;
  updateProxyEntries(entries: ProxyEntry[]): Promise<void>;
  updateProxyAssignments(assignments: ProxyAssignments): Promise<void>;
  setAgentCredential(agentId: AgentCli, apiKey: string): Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  user: defaultUserSettings(),
  loaded: false,
  projectSettings: null,

  load: async () => {
    const user = await ipcClient.settings().getUser();
    set({ user, loaded: true });
  },

  setTheme: async (theme) => {
    const next = { ...get().user, theme };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  setLanguage: async (language) => {
    const next = { ...get().user, language };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  setDefaultAgentCli: async (defaultAgentCli) => {
    const next = { ...get().user, defaultAgentCli };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  setCostTracking: async (costTracking) => {
    const next = { ...get().user, costTracking };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  setComplianceOutputMode: async (complianceOutputMode) => {
    const next = { ...get().user, complianceOutputMode };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  setShowEventLog: async (showEventLog) => {
    const next = { ...get().user, showEventLog };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  loadProject: async (projectPath) => {
    try {
      const ps = await ipcClient.settings().getProject(projectPath);
      set({ projectSettings: ps });
    } catch { /* swallow — project settings are best-effort */ }
  },

  saveProject: async (projectPath, s) => {
    await ipcClient.settings().setProject(projectPath, s);
    set({ projectSettings: s });
  },

  updateProxyEntries: async (entries) => {
    const next = { ...get().user, proxyEntries: entries };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  updateProxyAssignments: async (assignments) => {
    const next = { ...get().user, proxyAssignments: assignments };
    set({ user: next });
    await ipcClient.settings().setUser(next);
  },

  setAgentCredential: async (agentId, apiKey) => {
    await window.sherpa.agent.storeKey(agentId, apiKey);
    const user = await ipcClient.settings().getUser();
    set({ user });
  },
}));
