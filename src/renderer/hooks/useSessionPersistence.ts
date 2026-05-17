// src/renderer/hooks/useSessionPersistence.ts
import { useEffect } from 'react';
import { useProject } from '../store/project';
import { useTask } from '../store/task';
import { useSideBar, type Activity } from '../store/sidebar';
import { useRightSidebar } from '../store/right_sidebar';
import { useBottomPanel } from '../store/bottom_panel';
import { ipcClient } from '../ipc/client';

/**
 * Writes the active task ID and layout state to session.json whenever they change.
 * Mounted once at the Shell level — no return value.
 */
export function useSessionPersistence(): void {
  const projectPath = useProject((s) => s.current?.path ?? null);
  const activeTaskId = useTask((s) => s.current?.id ?? null);
  const leftActivity = useSideBar((s) => s.activity);
  const leftWidth = useSideBar((s) => s.width);
  const rightOpen = useRightSidebar((s) => s.isOpen);
  const rightWidth = useRightSidebar((s) => s.width);
  const rightCollapsed = useRightSidebar((s) => s.collapsedSections);
  const bottomOpen = useBottomPanel((s) => s.isOpen);
  const bottomHeight = useBottomPanel((s) => s.height);

  useEffect(() => {
    if (!projectPath) return;
    void ipcClient.session().set(projectPath, {
      activeTaskId,
      leftActivity,
      leftWidth,
      rightOpen,
      rightWidth,
      rightCollapsed: Array.from(rightCollapsed),
      bottomOpen,
      bottomHeight,
    });
  }, [
    projectPath,
    activeTaskId,
    leftActivity,
    leftWidth,
    rightOpen,
    rightWidth,
    rightCollapsed,
    bottomOpen,
    bottomHeight,
  ]);
}

/**
 * Restores layout state from a session object.
 * Called from the project store after opening a project.
 */
export function restoreLayoutFromSession(session: {
  leftActivity?: string | null;
  leftWidth?: number;
  rightOpen?: boolean;
  rightWidth?: number;
  rightCollapsed?: string[];
  bottomOpen?: boolean;
  bottomHeight?: number;
}): void {
  if (session.leftActivity !== undefined) {
    const VALID_ACTIVITIES: Activity[] = ['files', 'tasks', 'library', 'settings'];
    const activityVal = session.leftActivity;
    useSideBar.getState().setActivity(
      activityVal === null || activityVal === undefined
        ? null
        : (VALID_ACTIVITIES as string[]).includes(activityVal) ? (activityVal as Activity) : null
    );
  }
  if (session.leftWidth !== undefined) {
    useSideBar.getState().setWidth(session.leftWidth);
  }
  if (session.rightOpen !== undefined) {
    if (session.rightOpen) {
      useRightSidebar.getState().open();
    } else {
      useRightSidebar.getState().close();
    }
  }
  if (session.rightWidth !== undefined) {
    useRightSidebar.getState().setWidth(session.rightWidth);
  }
  if (session.rightCollapsed) {
    useRightSidebar.getState().setCollapsedSections(session.rightCollapsed);
  }
  if (session.bottomOpen !== undefined) {
    useBottomPanel.setState({ isOpen: session.bottomOpen });
  }
  if (session.bottomHeight !== undefined) {
    useBottomPanel.getState().setHeight(session.bottomHeight);
  }
}
