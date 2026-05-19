// src/main/services/event_bus.ts
// Extension Framework Plan 02 Task 3 — typed EventBus singleton.
//
// Wraps node:events.EventEmitter with a discriminated-union API over
// `AppEvent`. Persists every emit through `EventBusDb` (when provided)
// and broadcasts to every registered `BrowserWindow` via the existing
// `CH.APP_EVENT` IPC channel — single-arg payload shape (the legacy
// `setupIpcEventBridge` keeps emitting two-arg `(name, payload)` for
// backwards compatibility; preload disambiguates by argument count).

import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';

import type { AppEvent } from '../../core/domain/app_events';
import { CH } from '../ipc/channels';
import type { EventBusDb, EventLogFilter } from './event_bus_db';

type EventType = AppEvent['type'];
type Handler<T extends EventType> = (ev: Extract<AppEvent, { type: T }>) => void;

export class EventBus {
  private readonly emitter = new EventEmitter();
  private windows: BrowserWindow[] = [];

  constructor(private readonly db: EventBusDb | null) {
    // Plenty of room for extension subscribers + internal listeners.
    this.emitter.setMaxListeners(100);
  }

  /**
   * Replace the set of windows that receive broadcast IPC. Called by the
   * main process after window creation; safe to call again on
   * additional window open / close.
   */
  setWindows(wins: BrowserWindow[]): void {
    this.windows = wins;
  }

  /**
   * Emit an event:
   *   1. Persist via EventBusDb (if attached).
   *   2. Fan out to typed local subscribers via EventEmitter.
   *   3. Fan out to `onAny` subscribers via the synthetic `*` channel.
   *   4. Broadcast to every BrowserWindow over CH.APP_EVENT (single-arg).
   */
  emit(ev: AppEvent): void {
    try {
      this.db?.insert(ev);
    } catch {
      // Persistence is best-effort — never let DB errors block delivery.
    }
    this.emitter.emit(ev.type, ev);
    this.emitter.emit('*', ev);
    for (const w of this.windows) {
      if (w.isDestroyed()) continue;
      w.webContents.send(CH.APP_EVENT, ev);
    }
  }

  /**
   * Subscribe to a single typed event. Returns an unsubscribe function.
   */
  on<T extends EventType>(type: T, handler: Handler<T>): () => void {
    this.emitter.on(type, handler as (e: AppEvent) => void);
    return () => {
      this.emitter.off(type, handler as (e: AppEvent) => void);
    };
  }

  /**
   * Subscribe to every event regardless of type. Returns an unsubscribe
   * function.
   */
  onAny(handler: (ev: AppEvent) => void): () => void {
    this.emitter.on('*', handler);
    return () => {
      this.emitter.off('*', handler);
    };
  }

  /**
   * Replay persisted events through the same filter the renderer / SDK
   * uses. Returns an empty array when no DB is attached (e.g. tests).
   */
  replay(filter: EventLogFilter = {}): AppEvent[] {
    return this.db?.list(filter) ?? [];
  }

  /**
   * Delete every persisted event older than `cutoffTs`. No-op when no DB
   * is attached. Returns the number of rows pruned.
   */
  pruneOlderThan(cutoffTs: number): number {
    return this.db?.pruneOlderThan(cutoffTs) ?? 0;
  }
}
