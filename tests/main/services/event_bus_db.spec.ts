// tests/main/services/event_bus_db.spec.ts
// Extension Framework Plan 02 — EventBusDb persistence tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { EventBusDb } from '../../../src/main/services/event_bus_db';

describe('EventBusDb', () => {
  let db: Database.Database;
  let bus: EventBusDb;

  beforeEach(() => {
    db = new Database(':memory:');
    bus = new EventBusDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('inserts and lists by type', () => {
    bus.insert({ type: 'task.created', ts: 1, taskId: 'T1' });
    bus.insert({
      type: 'file.changed',
      ts: 2,
      projectPath: '/p',
      relPath: 'a.md',
      action: 'created',
    });
    const ev = bus.list({ type: 'task.created' });
    expect(ev.length).toBe(1);
    expect(ev[0]?.type).toBe('task.created');
  });

  it('filters by taskId', () => {
    bus.insert({ type: 'task.created', ts: 1, taskId: 'T1' });
    bus.insert({ type: 'task.created', ts: 2, taskId: 'T2' });
    expect(bus.list({ taskId: 'T1' }).length).toBe(1);
    expect(bus.list({ taskId: 'T2' }).length).toBe(1);
  });

  it('filters by sinceTs', () => {
    bus.insert({ type: 'task.created', ts: 10, taskId: 'T1' });
    bus.insert({ type: 'task.created', ts: 20, taskId: 'T2' });
    bus.insert({ type: 'task.created', ts: 30, taskId: 'T3' });
    expect(bus.list({ sinceTs: 20 }).length).toBe(2);
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      bus.insert({ type: 'task.created', ts: i, taskId: `T${i}` });
    }
    expect(bus.list({ limit: 3 }).length).toBe(3);
  });

  it('orders results by ts ASC', () => {
    bus.insert({ type: 'task.created', ts: 30, taskId: 'C' });
    bus.insert({ type: 'task.created', ts: 10, taskId: 'A' });
    bus.insert({ type: 'task.created', ts: 20, taskId: 'B' });
    const list = bus.list({ type: 'task.created' });
    expect(list.map((e) => ('taskId' in e ? e.taskId : ''))).toEqual(['A', 'B', 'C']);
  });

  it('prunes old events', () => {
    bus.insert({ type: 'task.created', ts: 1, taskId: 'T1' });
    bus.insert({ type: 'task.created', ts: 100, taskId: 'T2' });
    const removed = bus.pruneOlderThan(50);
    expect(removed).toBe(1);
    expect(bus.list({}).length).toBe(1);
  });

  it('round-trips events that have no taskId field (e.g. project.opened)', () => {
    bus.insert({ type: 'project.opened', ts: 7, projectPath: '/here' });
    const list = bus.list({ type: 'project.opened' });
    expect(list.length).toBe(1);
    const ev = list[0];
    expect(ev?.type).toBe('project.opened');
    if (ev && ev.type === 'project.opened') {
      expect(ev.projectPath).toBe('/here');
    }
  });
});
