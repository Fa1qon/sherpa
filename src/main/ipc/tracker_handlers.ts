// src/main/ipc/tracker_handlers.ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { CH } from './channels';
import { ProjectDatabase } from '../../core/adapters/project_database';
import type { TrackerService } from '../services/tracker_service';
import type { BoardConfig, FieldValue } from '../../core/domain/tracker';

const projectDbs = new Map<string, ProjectDatabase>();

function getDb(projectPath: string): ProjectDatabase {
  let db = projectDbs.get(projectPath);
  if (!db) {
    db = new ProjectDatabase(projectPath);
    projectDbs.set(projectPath, db);
  }
  return db;
}

export function registerTrackerHandlers(tracker: TrackerService): void {
  // Lazy require so this module loads in vitest (where electron is unavailable).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron') as { ipcMain: IpcMain | undefined };
  const ipcMain = electron.ipcMain;
  // Guard: no-op when electron is not available (e.g. in vitest).
  if (!ipcMain) return;

  ipcMain.handle(
    CH.TRACKER_GET_BOARD_CONFIG,
    (_e: IpcMainInvokeEvent, projectPath: string) => {
      tracker.setDatabase(getDb(projectPath));
      return tracker.getBoardConfig('');
    },
  );

  ipcMain.handle(
    CH.TRACKER_SET_BOARD_CONFIG,
    (_e: IpcMainInvokeEvent, projectPath: string, config: BoardConfig) => {
      tracker.setDatabase(getDb(projectPath));
      tracker.setBoardConfig('', config);
    },
  );

  ipcMain.handle(
    CH.TRACKER_LIST_TASKS,
    (_e: IpcMainInvokeEvent, projectPath: string) => {
      tracker.setDatabase(getDb(projectPath));
      return tracker.listTrackerTasks(projectPath);
    },
  );

  ipcMain.handle(
    CH.TRACKER_MOVE_TO_STAGE,
    (_e: IpcMainInvokeEvent, projectPath: string, taskId: string, stageId: string) => {
      tracker.setDatabase(getDb(projectPath));
      tracker.moveToStage(taskId, stageId);
      return tracker.getTrackerTask(taskId);
    },
  );

  ipcMain.handle(
    CH.TRACKER_ADD_TASK_TO_BOARD,
    (_e: IpcMainInvokeEvent, projectPath: string, taskId: string, stageId: string) => {
      tracker.setDatabase(getDb(projectPath));
      return tracker.addTaskToBoard(taskId, stageId);
    },
  );

  ipcMain.handle(
    CH.TRACKER_SET_FIELD,
    (_e: IpcMainInvokeEvent, projectPath: string, taskId: string, fieldId: string, value: FieldValue) => {
      tracker.setDatabase(getDb(projectPath));
      tracker.setField(taskId, fieldId, value);
      return tracker.getTrackerTask(taskId);
    },
  );
}
