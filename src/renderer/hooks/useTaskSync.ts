// src/renderer/hooks/useTaskSync.ts
// Polls TaskMeta from disk (1s) and loads the active methodology into the
// task store. Designed to be called once in a component that mounts when
// a task is active (e.g. TaskWorkspace). Polling stops when component
// unmounts or when task/project changes.
import { useCallback, useEffect, useRef } from 'react';
import { useTask } from '../store/task';
import { useProject } from '../store/project';

export function useTaskSync(): void {
  const task = useTask((s) => s.current);
  const setMeta = useTask((s) => s.setMeta);
  const setMethodology = useTask((s) => s.setMethodology);
  const project = useProject((s) => s.current);
  const mountedRef = useRef<boolean>(true);

  const projectPath = project?.path ?? '';
  const taskId = task?.id ?? '';
  const methodologyId = task?.methodologyId ?? '';

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshMeta = useCallback(async (): Promise<void> => {
    if (!projectPath || !taskId) return;
    try {
      const m = await window.sherpa.task.metaGet({ projectPath, taskId });
      if (!mountedRef.current) return;
      setMeta(m);
    } catch {
      // Best-effort polling — swallow transient IPC errors.
    }
  }, [projectPath, taskId, setMeta]);

  useEffect(() => {
    if (!projectPath || !taskId) return;
    setMeta(null);
    void refreshMeta();
    const id = setInterval(() => {
      void refreshMeta();
    }, 1000);
    return () => clearInterval(id);
  }, [projectPath, taskId, refreshMeta, setMeta]);

  useEffect(() => {
    if (!projectPath || !methodologyId) {
      setMethodology(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await window.sherpa.methodology.load(projectPath, methodologyId);
        if (cancelled) return;
        setMethodology(r.ok ? r.methodology : null);
      } catch {
        if (!cancelled) setMethodology(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath, methodologyId, setMethodology]);
}
