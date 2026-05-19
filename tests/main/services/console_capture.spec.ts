// tests/main/services/console_capture.spec.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';

import { ConsoleCapture } from '../../../src/main/services/console_capture';

/** Helper: emit a new-style `console-message` event with the MessageDetails shape. */
function emitNew(
  ee: EventEmitter,
  details: { message: string; level?: string; lineNumber?: number; sourceId?: string },
): void {
  ee.emit('console-message', details);
}

/** Helper: emit a legacy positional `console-message` event. */
function emitLegacy(
  ee: EventEmitter,
  level: number,
  message: string,
  line = 0,
  source = '',
): void {
  ee.emit('console-message', {} /* event */, level, message, line, source);
}

describe('ConsoleCapture', () => {
  let cap: ConsoleCapture;
  let ee: EventEmitter;

  beforeEach(() => {
    cap = new ConsoleCapture();
    ee = new EventEmitter();
    cap.attach(ee as unknown as WebContents);
  });

  test('buffer is empty initially', () => {
    expect(cap.get()).toEqual([]);
  });

  test('captures a console-message in new-style shape with correct fields', () => {
    const before = Date.now();
    emitNew(ee, {
      message: 'hello world',
      level: 'info',
      lineNumber: 42,
      sourceId: 'https://example.com/app.js',
    });
    const after = Date.now();

    const all = cap.get();
    expect(all).toHaveLength(1);
    const e = all[0];
    expect(e.level).toBe('info');
    expect(e.text).toBe('hello world');
    expect(e.line).toBe(42);
    expect(e.source).toBe('https://example.com/app.js');
    expect(e.ts).toBeGreaterThanOrEqual(before);
    expect(e.ts).toBeLessThanOrEqual(after);
  });

  test('maps Electron warning level to warn', () => {
    emitNew(ee, { message: 'careful', level: 'warning' });
    expect(cap.get()[0].level).toBe('warn');
  });

  test('maps unknown level to log', () => {
    emitNew(ee, { message: 'mystery', level: 'unknown-level' });
    expect(cap.get()[0].level).toBe('log');
  });

  test('captures error level from new-style event', () => {
    emitNew(ee, { message: 'boom', level: 'error' });
    expect(cap.get()[0].level).toBe('error');
  });

  test('supports legacy positional event signature', () => {
    // legacy levels: 0=verbose (debug), 1=info, 2=warning, 3=error
    emitLegacy(ee, 3, 'legacy boom', 7, 'file.js');
    const e = cap.get()[0];
    expect(e.level).toBe('error');
    expect(e.text).toBe('legacy boom');
    expect(e.line).toBe(7);
    expect(e.source).toBe('file.js');
  });

  test('get(sinceMs) filters by timestamp', async () => {
    emitNew(ee, { message: 'first', level: 'info' });
    // Ensure a measurable time gap.
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    emitNew(ee, { message: 'second', level: 'info' });

    const since = cap.get(cutoff);
    expect(since).toHaveLength(1);
    expect(since[0].text).toBe('second');

    expect(cap.get()).toHaveLength(2);
  });

  test('get() returns a defensive copy (mutating result does not affect buffer)', () => {
    emitNew(ee, { message: 'a', level: 'info' });
    const out = cap.get();
    out.pop();
    expect(cap.get()).toHaveLength(1);
  });

  test('clear() empties the buffer', () => {
    emitNew(ee, { message: 'a', level: 'info' });
    emitNew(ee, { message: 'b', level: 'info' });
    expect(cap.get()).toHaveLength(2);
    cap.clear();
    expect(cap.get()).toEqual([]);
  });

  test('ring buffer rotates when exceeding MAX (1001 entries -> oldest dropped)', () => {
    // MAX is 1000. Push 1001 entries; the first one should be evicted.
    for (let i = 0; i < 1001; i++) {
      emitNew(ee, { message: `msg-${i}`, level: 'info' });
    }
    const all = cap.get();
    expect(all).toHaveLength(1000);
    expect(all[0].text).toBe('msg-1');
    expect(all[all.length - 1].text).toBe('msg-1000');
  });

  test('respects custom MAX passed to constructor', () => {
    const small = new ConsoleCapture(3);
    const ee2 = new EventEmitter();
    small.attach(ee2 as unknown as WebContents);
    for (let i = 0; i < 5; i++) {
      ee2.emit('console-message', { message: `m${i}`, level: 'info' });
    }
    const all = small.get();
    expect(all.map((e) => e.text)).toEqual(['m2', 'm3', 'm4']);
  });

  test('ignores malformed events with no message', () => {
    ee.emit('console-message', { level: 'info' } as unknown);
    expect(cap.get()).toEqual([]);
  });

  test('attach() returns a disposer that removes the listener', () => {
    const cap2 = new ConsoleCapture();
    const ee2 = new EventEmitter();
    const dispose = cap2.attach(ee2 as unknown as WebContents);

    emitNew(ee2, { message: 'before-dispose', level: 'info' });
    expect(cap2.get()).toHaveLength(1);
    expect(ee2.listenerCount('console-message')).toBe(1);

    dispose();
    expect(ee2.listenerCount('console-message')).toBe(0);

    emitNew(ee2, { message: 'after-dispose', level: 'info' });
    expect(cap2.get()).toHaveLength(1);
    expect(cap2.get()[0].text).toBe('before-dispose');
  });
});
