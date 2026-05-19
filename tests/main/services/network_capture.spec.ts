// tests/main/services/network_capture.spec.ts
import { describe, test, expect, beforeEach } from 'vitest';
import type { Session } from 'electron';

import { NetworkCapture } from '../../../src/main/services/network_capture';

type BeforeListener =
  | ((details: { id: number; url: string; method: string }, cb: (r: unknown) => void) => void)
  | null;
type CompletedListener =
  | ((details: {
      id: number;
      statusCode?: number;
      responseHeaders?: Record<string, string[]>;
    }) => void)
  | null;

interface MockSession {
  beforeListener: BeforeListener;
  completedListener: CompletedListener;
  session: Session;
}

function makeMockSession(): MockSession {
  const m: MockSession = {
    beforeListener: null,
    completedListener: null,
    // Will be replaced below — we need the closure to refer to `m`.
    session: {} as Session,
  };
  m.session = {
    webRequest: {
      onBeforeRequest: (listener: BeforeListener) => {
        m.beforeListener = listener;
      },
      onCompleted: (listener: CompletedListener) => {
        m.completedListener = listener;
      },
    },
  } as unknown as Session;
  return m;
}

function fireBefore(
  m: MockSession,
  details: { id: number; url: string; method: string },
): void {
  m.beforeListener?.(details, () => {
    /* noop callback */
  });
}

function fireCompleted(
  m: MockSession,
  details: {
    id: number;
    statusCode?: number;
    responseHeaders?: Record<string, string[]>;
  },
): void {
  m.completedListener?.(details);
}

describe('NetworkCapture', () => {
  let cap: NetworkCapture;
  let m: MockSession;

  beforeEach(() => {
    cap = new NetworkCapture();
    m = makeMockSession();
    cap.attach(m.session);
  });

  test('buffer is empty initially', () => {
    expect(cap.get()).toEqual([]);
  });

  test('records an entry after onBeforeRequest + onCompleted', async () => {
    const before = Date.now();
    fireBefore(m, { id: 1, url: 'https://example.com/a', method: 'GET' });
    // Small delay so durationMs > 0.
    await new Promise((r) => setTimeout(r, 5));
    fireCompleted(m, {
      id: 1,
      statusCode: 200,
      responseHeaders: {
        'content-type': ['text/html; charset=utf-8'],
        'content-length': ['12345'],
      },
    });
    const after = Date.now();

    const entries = cap.get();
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.id).toBe('1');
    expect(e.url).toBe('https://example.com/a');
    expect(e.method).toBe('GET');
    expect(e.status).toBe(200);
    expect(e.mime).toBe('text/html; charset=utf-8');
    expect(e.sizeBytes).toBe(12345);
    expect(e.durationMs).toBeGreaterThanOrEqual(0);
    expect(e.ts).toBeGreaterThanOrEqual(before);
    expect(e.ts).toBeLessThanOrEqual(after);
  });

  test('onCompleted without matching onBeforeRequest is ignored', () => {
    fireCompleted(m, {
      id: 999,
      statusCode: 200,
      responseHeaders: { 'content-type': ['text/plain'] },
    });
    expect(cap.get()).toEqual([]);
  });

  test('get(sinceMs) filters by timestamp', async () => {
    fireBefore(m, { id: 1, url: 'https://example.com/1', method: 'GET' });
    fireCompleted(m, { id: 1, statusCode: 200 });
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    fireBefore(m, { id: 2, url: 'https://example.com/2', method: 'GET' });
    fireCompleted(m, { id: 2, statusCode: 200 });

    const since = cap.get(cutoff);
    expect(since).toHaveLength(1);
    expect(since[0].url).toBe('https://example.com/2');
    expect(cap.get()).toHaveLength(2);
  });

  test('get(undefined, mime) filters by mime prefix', () => {
    fireBefore(m, { id: 1, url: 'https://x/a', method: 'GET' });
    fireCompleted(m, {
      id: 1,
      statusCode: 200,
      responseHeaders: { 'content-type': ['text/html'] },
    });
    fireBefore(m, { id: 2, url: 'https://x/b', method: 'GET' });
    fireCompleted(m, {
      id: 2,
      statusCode: 200,
      responseHeaders: { 'content-type': ['application/json'] },
    });
    fireBefore(m, { id: 3, url: 'https://x/c', method: 'GET' });
    fireCompleted(m, {
      id: 3,
      statusCode: 200,
      responseHeaders: { 'content-type': ['text/css'] },
    });

    const onlyText = cap.get(undefined, 'text/');
    expect(onlyText.map((e) => e.url)).toEqual(['https://x/a', 'https://x/c']);

    const onlyHtml = cap.get(undefined, 'text/html');
    expect(onlyHtml.map((e) => e.url)).toEqual(['https://x/a']);
  });

  test('clear() empties the buffer', () => {
    fireBefore(m, { id: 1, url: 'https://x', method: 'GET' });
    fireCompleted(m, { id: 1, statusCode: 200 });
    expect(cap.get()).toHaveLength(1);
    cap.clear();
    expect(cap.get()).toEqual([]);
  });

  test('ring buffer rotates when exceeding MAX', () => {
    const small = new NetworkCapture(3);
    const m2 = makeMockSession();
    small.attach(m2.session);
    for (let i = 0; i < 5; i++) {
      fireBefore(m2, { id: i, url: `https://x/${i}`, method: 'GET' });
      fireCompleted(m2, { id: i, statusCode: 200 });
    }
    const all = small.get();
    expect(all.map((e) => e.url)).toEqual([
      'https://x/2',
      'https://x/3',
      'https://x/4',
    ]);
  });

  test('disposer returned by attach() detaches both listeners', () => {
    const cap2 = new NetworkCapture();
    const m2 = makeMockSession();
    const dispose = cap2.attach(m2.session);

    // Sanity: listeners are installed.
    expect(m2.beforeListener).not.toBeNull();
    expect(m2.completedListener).not.toBeNull();

    fireBefore(m2, { id: 1, url: 'https://x', method: 'GET' });
    fireCompleted(m2, { id: 1, statusCode: 200 });
    expect(cap2.get()).toHaveLength(1);

    dispose();

    // After dispose, the mock session was re-called with `null` for both hooks.
    expect(m2.beforeListener).toBeNull();
    expect(m2.completedListener).toBeNull();

    // No more entries can be added because there is no listener to invoke.
    fireBefore(m2, { id: 2, url: 'https://x/2', method: 'GET' });
    fireCompleted(m2, { id: 2, statusCode: 200 });
    expect(cap2.get()).toHaveLength(1);
  });

  test('header lookup handles both content-type and Content-Type (case)', () => {
    fireBefore(m, { id: 1, url: 'https://x/lower', method: 'GET' });
    fireCompleted(m, {
      id: 1,
      statusCode: 200,
      responseHeaders: {
        'content-type': ['text/html'],
        'content-length': ['10'],
      },
    });
    fireBefore(m, { id: 2, url: 'https://x/title', method: 'GET' });
    fireCompleted(m, {
      id: 2,
      statusCode: 200,
      responseHeaders: {
        'Content-Type': ['application/json'],
        'Content-Length': ['20'],
      },
    });

    const all = cap.get();
    expect(all).toHaveLength(2);
    expect(all[0].mime).toBe('text/html');
    expect(all[0].sizeBytes).toBe(10);
    expect(all[1].mime).toBe('application/json');
    expect(all[1].sizeBytes).toBe(20);
  });
});
