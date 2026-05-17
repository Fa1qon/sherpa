// src/renderer/store/browser.ts
import { create } from 'zustand';
import { browserIpc } from '../ipc/browser_ipc';
import type { BrowserEvent, BrowserMode, BrowserState } from '../../core/domain/browser';
import type { ScreenshotResult } from '../../core/ports/browser_port';

interface SessionEntry extends BrowserState {
  lastScreenshot: ScreenshotResult | null;
}

interface BrowserStoreState {
  activeSessions: Record<string, SessionEntry>;
  openSession: (taskId: string, mode: BrowserMode) => Promise<void>;
  closeSession: (taskId: string) => Promise<void>;
  navigate: (taskId: string, url: string) => Promise<void>;
  captureScreenshot: (taskId: string) => Promise<ScreenshotResult | null>;
  pushEvent: (taskId: string, event: BrowserEvent) => void;
  reset: () => void;
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => {
  let unsubEvent: (() => void) | null = null;

  function ensureEventListener(): void {
    if (unsubEvent) return;
    unsubEvent = browserIpc.onEvent((taskId, ev) => {
      get().pushEvent(taskId, ev as BrowserEvent);
    });
  }

  return {
    activeSessions: {},

    async openSession(taskId, mode) {
      ensureEventListener();
      const result = await browserIpc.open(taskId, mode);
      set((s) => ({
        activeSessions: {
          ...s.activeSessions,
          [taskId]: {
            sessionId: taskId,
            mode: result.mode,
            url: null,
            loading: false,
            events: [],
            lastScreenshot: null,
          },
        },
      }));
    },

    async closeSession(taskId) {
      await browserIpc.close(taskId);
      set((s) => {
        const { [taskId]: _removed, ...rest } = s.activeSessions;
        return { activeSessions: rest };
      });
    },

    async navigate(taskId, url) {
      set((s) => ({
        activeSessions: {
          ...s.activeSessions,
          [taskId]: s.activeSessions[taskId]
            ? { ...s.activeSessions[taskId]!, loading: true }
            : s.activeSessions[taskId]!,
        },
      }));
      try {
        await browserIpc.navigate(taskId, url);
        set((s) => ({
          activeSessions: {
            ...s.activeSessions,
            [taskId]: s.activeSessions[taskId]
              ? { ...s.activeSessions[taskId]!, url, loading: false }
              : s.activeSessions[taskId]!,
          },
        }));
      } catch (err) {
        set((s) => ({
          activeSessions: {
            ...s.activeSessions,
            [taskId]: s.activeSessions[taskId]
              ? { ...s.activeSessions[taskId]!, loading: false }
              : s.activeSessions[taskId]!,
          },
        }));
        throw err;
      }
    },

    async captureScreenshot(taskId) {
      const result = await browserIpc.screenshot(taskId).catch(() => null);
      if (result) {
        set((s) => ({
          activeSessions: {
            ...s.activeSessions,
            [taskId]: s.activeSessions[taskId]
              ? { ...s.activeSessions[taskId]!, lastScreenshot: result }
              : s.activeSessions[taskId]!,
          },
        }));
      }
      return result;
    },

    pushEvent(taskId, event) {
      set((s) => {
        const session = s.activeSessions[taskId];
        if (!session) return s;
        const events = [...session.events, event].slice(-200); // keep last 200
        return {
          activeSessions: {
            ...s.activeSessions,
            [taskId]: { ...session, events, url: event.url ?? session.url },
          },
        };
      });
    },

    reset() {
      set({ activeSessions: {} });
      unsubEvent?.();
      unsubEvent = null;
    },
  };
});
