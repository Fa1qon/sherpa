// src/renderer/store/project.ts
import { create } from 'zustand';
import type { Project, RecentEntry } from '../../core/domain/project';
import type { AddProjectOptions, AddProjectResult } from '../../core/ports/project_port';
import { ipcClient } from '../ipc/client';
import { useTask } from './task';
import { useNavigation } from './navigation';
import { restoreLayoutFromSession } from '../hooks/useSessionPersistence';

export interface ProjectState {
  /** Currently-open project (null = no project open, show Picker). */
  current: Project | null;
  /** Recent projects, sorted desc by lastOpenedAt. */
  recent: RecentEntry[];
  /** True while a project op is in flight. */
  busy: boolean;
  /** Last error, surfaced to UI; cleared by next op. */
  error: string | null;

  refreshRecent(): Promise<void>;
  addAndOpen(opts: AddProjectOptions): Promise<AddProjectResult>;
  openById(id: string): Promise<void>;
  closeProject(): void;
  removeFromRecent(id: string): Promise<void>;
}

export const useProject = create<ProjectState>((set, _get) => ({
  current: null,
  recent: [],
  busy: false,
  error: null,

  refreshRecent: async () => {
    set({ busy: true, error: null });
    try {
      const recent = await ipcClient.project().listRecent();
      set({ recent, busy: false });
    } catch (err) {
      set({ busy: false, error: (err as Error).message });
    }
  },

  addAndOpen: async (opts) => {
    set({ busy: true, error: null });
    const result = await ipcClient.project().add(opts);
    if (result.ok) {
      set({ current: result.project, busy: false });
      const recent = await ipcClient.project().listRecent();
      set({ recent });
    } else {
      set({ busy: false, error: errorMessage(result.error) });
    }
    return result;
  },

  openById: async (id) => {
    set({ busy: true, error: null });
    try {
      const opened = await ipcClient.project().open(id);
      if (!opened) {
        set({ busy: false, error: 'project not found' });
        return;
      }
      const recent = await ipcClient.project().listRecent();
      set({ current: opened, recent, busy: false });
      // Restore the last active task and layout state for this project.
      const session = await ipcClient.session().get(opened.path);
      if (session.activeTaskId) {
        const task = await ipcClient.task().get(session.activeTaskId);
        if (task) {
          useTask.getState().setCurrent(task);
          useNavigation.getState().openTab({
            kind: 'task',
            params: { taskId: task.id },
            title: task.title ?? task.id,
          });
        }
      }
      restoreLayoutFromSession(session);
    } catch (err) {
      set({ busy: false, error: (err as Error).message });
    }
  },

  closeProject: () => set({ current: null }),

  removeFromRecent: async (id) => {
    set({ busy: true, error: null });
    try {
      await ipcClient.project().removeFromRecent(id);
      const recent = await ipcClient.project().listRecent();
      set({ recent, busy: false });
    } catch (err) {
      set({ busy: false, error: (err as Error).message });
    }
  },
}));

function errorMessage(error: (AddProjectResult & { ok: false })['error']): string {
  switch (error.kind) {
    case 'path-not-found':
      return 'Path does not exist';
    case 'not-a-directory':
      return 'Path is not a directory';
    case 'sherpa-missing-and-no-scaffold':
      return 'No .sherpa/ found in this folder';
    case 'duplicate':
      return 'Project already in recent list';
    case 'fs-error':
      return error.message;
  }
}
