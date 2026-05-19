// tests/main/services/event_bus.spec.ts
// Extension Framework Plan 02 — EventBus singleton tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { EventBus } from '../../../src/main/services/event_bus';
import { EventBusDb } from '../../../src/main/services/event_bus_db';
import type { AppEvent } from '../../../src/core/domain/app_events';

describe('EventBus', () => {
  let db: Database.Database;
  let dbAdapter: EventBusDb;

  beforeEach(() => {
    db = new Database(':memory:');
    dbAdapter = new EventBusDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('delivers to typed subscriber', () => {
    const bus = new EventBus(dbAdapter);
    const received: AppEvent[] = [];
    bus.on('task.created', (e) => received.push(e));
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    expect(received.length).toBe(1);
    expect(received[0]?.type).toBe('task.created');
  });

  it('does not deliver to unrelated subscribers', () => {
    const bus = new EventBus(null);
    const received: AppEvent[] = [];
    bus.on('task.completed', (e) => received.push(e));
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    expect(received.length).toBe(0);
  });

  it('onAny receives every event', () => {
    const bus = new EventBus(null);
    const received: AppEvent[] = [];
    bus.onAny((e) => received.push(e));
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    bus.emit({ type: 'project.opened', ts: 2, projectPath: '/p' });
    expect(received.length).toBe(2);
  });

  it('replay returns persisted events', () => {
    const bus = new EventBus(dbAdapter);
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    bus.emit({ type: 'task.created', ts: 2, taskId: 'T2' });
    const r = bus.replay({ type: 'task.created' });
    expect(r.length).toBe(2);
  });

  it('replay returns [] when no db attached', () => {
    const bus = new EventBus(null);
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    expect(bus.replay({ type: 'task.created' })).toEqual([]);
  });

  it('on() returns an unsubscribe function', () => {
    const bus = new EventBus(null);
    const received: AppEvent[] = [];
    const off = bus.on('task.created', (e) => received.push(e));
    off();
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    expect(received.length).toBe(0);
  });

  it('onAny() returns an unsubscribe function', () => {
    const bus = new EventBus(null);
    const received: AppEvent[] = [];
    const off = bus.onAny((e) => received.push(e));
    off();
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    expect(received.length).toBe(0);
  });

  it('survives DB errors without dropping in-memory subscribers', () => {
    const flakyDb: EventBusDb = {
      insert: () => {
        throw new Error('disk full');
      },
      list: () => [],
      pruneOlderThan: () => 0,
    } as unknown as EventBusDb;
    const bus = new EventBus(flakyDb);
    const received: AppEvent[] = [];
    bus.on('task.created', (e) => received.push(e));
    bus.emit({ type: 'task.created', ts: 1, taskId: 'T1' });
    expect(received.length).toBe(1);
  });

  it('broadcasts to BrowserWindows via setWindows', () => {
    const bus = new EventBus(null);
    const sent: Array<{ ch: string; payload: AppEvent }> = [];
    const fakeWin = {
      isDestroyed: () => false,
      webContents: {
        send: (ch: string, payload: AppEvent) => sent.push({ ch, payload }),
      },
    } as unknown as Electron.BrowserWindow;
    bus.setWindows([fakeWin]);
    bus.emit({ type: 'project.opened', ts: 5, projectPath: '/p' });
    expect(sent.length).toBe(1);
    expect(sent[0]?.ch).toBe('app.event');
    expect(sent[0]?.payload.type).toBe('project.opened');
  });
});
