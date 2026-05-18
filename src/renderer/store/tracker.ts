// src/renderer/store/tracker.ts
import { create } from 'zustand';
import type { BoardConfig, TrackerTask } from '../../core/domain/tracker';

interface TrackerState {
  boardConfig: BoardConfig | null;
  tasks: TrackerTask[];
  loading: boolean;
  error: string | null;

  loadBoard(projectPath: string): Promise<void>;
  refreshTasks(projectPath: string): Promise<void>;
  moveToStage(projectPath: string, taskId: string, stageId: string): Promise<void>;
  setBoardConfig(projectPath: string, config: BoardConfig): Promise<void>;
  addTaskToBoard(projectPath: string, taskId: string, stageId: string): Promise<void>;
}

export const useTracker = create<TrackerState>((set, _get) => ({
  boardConfig: null,
  tasks: [],
  loading: false,
  error: null,

  async loadBoard(projectPath) {
    set({ loading: true, error: null });
    try {
      const [boardConfig, tasks] = await Promise.all([
        window.sherpa.tracker.getBoardConfig(projectPath),
        window.sherpa.tracker.listTasks(projectPath),
      ]);
      set({ boardConfig, tasks, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async refreshTasks(projectPath) {
    const tasks = await window.sherpa.tracker.listTasks(projectPath);
    set({ tasks });
  },

  async moveToStage(projectPath, taskId, stageId) {
    // Optimistic update
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, stageId } : t)),
    }));
    const updated = await window.sherpa.tracker.moveToStage(projectPath, taskId, stageId);
    if (updated) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === taskId ? updated : t)),
      }));
    }
  },

  async setBoardConfig(projectPath, config) {
    await window.sherpa.tracker.setBoardConfig(projectPath, config);
    set({ boardConfig: config });
  },

  async addTaskToBoard(projectPath, taskId, stageId) {
    const task = await window.sherpa.tracker.addTaskToBoard(projectPath, taskId, stageId);
    set((s) => ({
      tasks: s.tasks.some((t) => t.id === task.id)
        ? s.tasks.map((t) => (t.id === task.id ? task : t))
        : [...s.tasks, task],
    }));
  },
}));
