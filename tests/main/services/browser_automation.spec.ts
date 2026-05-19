// tests/main/services/browser_automation.spec.ts
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';

import { BrowserAutomationService } from '../../../src/main/services/browser_automation';
import type { UserBrowser } from '../../../src/main/services/user_browser';
import type { ConsoleCapture } from '../../../src/main/services/console_capture';
import type { NetworkCapture } from '../../../src/main/services/network_capture';

interface SendInputEventCall {
  type: string;
  x?: number;
  y?: number;
  button?: string;
  clickCount?: number;
  keyCode?: string;
  modifiers?: string[];
}

interface WcStub extends EventEmitter {
  executeJavaScript: ReturnType<typeof vi.fn>;
  sendInputEvent: ReturnType<typeof vi.fn>;
  capturePage: ReturnType<typeof vi.fn>;
  getURL: ReturnType<typeof vi.fn>;
}

function makeWc(opts: {
  url?: string;
  finishLoadImmediately?: boolean;
  executeResult?: unknown | ((code: string) => unknown);
}): WcStub {
  const ee = new EventEmitter() as WcStub;

  // Auto-fire did-finish-load when a listener is attached (so `await once` resolves).
  if (opts.finishLoadImmediately !== false) {
    ee.on('newListener', (event: string) => {
      if (event === 'did-finish-load') {
        setImmediate(() => { ee.emit('did-finish-load'); });
      }
    });
  }

  ee.executeJavaScript = vi.fn((code: string, _userGesture?: boolean) => {
    if (typeof opts.executeResult === 'function') {
      return Promise.resolve((opts.executeResult as (c: string) => unknown)(code));
    }
    return Promise.resolve(opts.executeResult ?? null);
  });

  ee.sendInputEvent = vi.fn();

  ee.capturePage = vi.fn(() =>
    Promise.resolve({
      toPNG: () => Buffer.from('pngdata'),
      getSize: () => ({ width: 100, height: 50 }),
    }),
  );

  ee.getURL = vi.fn(() => opts.url ?? 'about:blank');

  return ee;
}

function makeUserBrowser(opts: {
  wc: WcStub | null;
  ready?: boolean;
}): UserBrowser {
  const stub = {
    getWebContents: vi.fn(() => opts.wc),
    isReady: vi.fn(() => opts.ready ?? true),
    show: vi.fn(),
    navigate: vi.fn(),
  };
  return stub as unknown as UserBrowser;
}

function makeConsoleCapture(): ConsoleCapture {
  return {
    get: vi.fn((sinceMs?: number) => [{ level: 'log', text: 'hi', ts: sinceMs ?? 1 }]),
  } as unknown as ConsoleCapture;
}

function makeNetworkCapture(): NetworkCapture {
  return {
    get: vi.fn((sinceMs?: number, filterMime?: string) => [
      { id: '1', url: 'https://x', method: 'GET', ts: sinceMs ?? 1, mime: filterMime },
    ]),
  } as unknown as NetworkCapture;
}

describe('BrowserAutomationService', () => {
  let consoleCap: ConsoleCapture;
  let netCap: NetworkCapture;

  beforeEach(() => {
    consoleCap = makeConsoleCapture();
    netCap = makeNetworkCapture();
  });

  test('wc() throws when getWebContents returns null', () => {
    const ub = makeUserBrowser({ wc: null });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    expect(() => svc.getHtml()).rejects.toThrow(/Browser not initialized/);
  });

  test('navigate: shows browser if not ready, returns {ok, finalUrl}', async () => {
    const wc = makeWc({ url: 'https://final.example' });
    const ub = makeUserBrowser({ wc, ready: false });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.navigate('https://final.example');
    expect((ub.show as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      0,
      0,
      800,
      600,
      'https://final.example',
    );
    expect((ub.navigate as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, finalUrl: 'https://final.example' });
  });

  test('navigate: calls userBrowser.navigate if already ready', async () => {
    const wc = makeWc({ url: 'https://x' });
    const ub = makeUserBrowser({ wc, ready: true });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    await svc.navigate('https://x');
    expect((ub.show as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((ub.navigate as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('https://x');
  });

  test('screenshot: returns {base64, width, height}', async () => {
    const wc = makeWc({});
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.screenshot();
    expect(r).toEqual({
      base64: Buffer.from('pngdata').toString('base64'),
      width: 100,
      height: 50,
    });
  });

  test('getHtml() with no selector executes documentElement.outerHTML', async () => {
    const wc = makeWc({ executeResult: '<html></html>' });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.getHtml();
    expect(r).toEqual({ html: '<html></html>' });
    const call = wc.executeJavaScript.mock.calls[0]![0] as string;
    expect(call).toContain('documentElement.outerHTML');
    expect(wc.executeJavaScript.mock.calls[0]![1]).toBe(true);
  });

  test('getHtml("h1") executes JS containing the selector', async () => {
    const wc = makeWc({ executeResult: '<h1>Title</h1>' });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.getHtml('h1');
    expect(r).toEqual({ html: '<h1>Title</h1>' });
    const call = wc.executeJavaScript.mock.calls[0]![0] as string;
    expect(call).toContain('querySelector("h1")');
    expect(call).toContain('outerHTML');
  });

  test('querySelector("h1"): single-element path uses [].filter(Boolean)', async () => {
    const wc = makeWc({
      executeResult: { count: 1, items: [{ tag: 'h1', text: 'Hi', attributes: {}, boundingRect: { x: 0, y: 0, width: 10, height: 10 } }] },
    });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.querySelector('h1');
    expect(r.count).toBe(1);
    expect(r.items).toHaveLength(1);
    const code = wc.executeJavaScript.mock.calls[0]![0] as string;
    expect(code).toContain('document.querySelector("h1")');
    expect(code).toContain('.filter(Boolean)');
    expect(code).not.toContain('querySelectorAll');
  });

  test('querySelector("h1", true): all-elements path uses querySelectorAll', async () => {
    const wc = makeWc({ executeResult: { count: 2, items: [] } });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.querySelector('h1', true);
    expect(r.count).toBe(2);
    const code = wc.executeJavaScript.mock.calls[0]![0] as string;
    expect(code).toContain('document.querySelectorAll("h1")');
    expect(code).not.toContain('.filter(Boolean)');
  });

  test('evaluateJs: returns {result} on success', async () => {
    const wc = makeWc({ executeResult: { ok: true, result: 42 } });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.evaluateJs('return 42');
    expect(r).toEqual({ result: 42 });
    const code = wc.executeJavaScript.mock.calls[0]![0] as string;
    expect(code).toContain('return 42');
    expect(code).toContain('try');
    expect(code).toContain('JSON.parse(JSON.stringify');
  });

  test('evaluateJs: returns {error} on thrown error', async () => {
    const wc = makeWc({ executeResult: { ok: false, error: 'oops' } });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.evaluateJs('throw new Error("x")');
    expect(r).toEqual({ error: 'oops' });
  });

  test('click: bbox found -> mouseDown + mouseUp at integer center', async () => {
    const wc = makeWc({ executeResult: { x: 50.6, y: 100.4 } });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.click('#btn');
    expect(r).toEqual({ ok: true });
    expect(wc.sendInputEvent).toHaveBeenCalledTimes(2);
    const down = wc.sendInputEvent.mock.calls[0]![0] as SendInputEventCall;
    const up = wc.sendInputEvent.mock.calls[1]![0] as SendInputEventCall;
    expect(down.type).toBe('mouseDown');
    expect(down.x).toBe(51);
    expect(down.y).toBe(100);
    expect(down.button).toBe('left');
    expect(down.clickCount).toBe(1);
    expect(up.type).toBe('mouseUp');
    expect(up.x).toBe(51);
    expect(up.y).toBe(100);
  });

  test('click: bbox null -> {ok:false} and no sendInputEvent', async () => {
    const wc = makeWc({ executeResult: null });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.click('#missing');
    expect(r).toEqual({ ok: false });
    expect(wc.sendInputEvent).not.toHaveBeenCalled();
  });

  test('type: focus succeeds, then one char event per character', async () => {
    const wc = makeWc({ executeResult: true });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.type('#input', 'ab');
    expect(r).toEqual({ ok: true });
    expect(wc.sendInputEvent).toHaveBeenCalledTimes(2);
    const a = wc.sendInputEvent.mock.calls[0]![0] as SendInputEventCall;
    const b = wc.sendInputEvent.mock.calls[1]![0] as SendInputEventCall;
    expect(a).toMatchObject({ type: 'char', keyCode: 'a' });
    expect(b).toMatchObject({ type: 'char', keyCode: 'b' });
  });

  test('type: focus fails -> {ok:false}, no input events', async () => {
    const wc = makeWc({ executeResult: false });
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.type('#missing', 'ab');
    expect(r).toEqual({ ok: false });
    expect(wc.sendInputEvent).not.toHaveBeenCalled();
  });

  test('key: sends keyDown + keyUp with keyCode and modifiers', async () => {
    const wc = makeWc({});
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.key('Enter', ['Shift']);
    expect(r).toEqual({ ok: true });
    expect(wc.sendInputEvent).toHaveBeenCalledTimes(2);
    const down = wc.sendInputEvent.mock.calls[0]![0] as SendInputEventCall;
    const up = wc.sendInputEvent.mock.calls[1]![0] as SendInputEventCall;
    expect(down).toMatchObject({ type: 'keyDown', keyCode: 'Enter', modifiers: ['Shift'] });
    expect(up).toMatchObject({ type: 'keyUp', keyCode: 'Enter', modifiers: ['Shift'] });
  });

  test('drag: mouseDown + 10 mouseMoves + mouseUp', async () => {
    const wc = makeWc({});
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = await svc.drag({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(r).toEqual({ ok: true });
    expect(wc.sendInputEvent).toHaveBeenCalledTimes(12);
    const calls = wc.sendInputEvent.mock.calls.map((c) => c[0] as SendInputEventCall);
    expect(calls[0]!.type).toBe('mouseDown');
    expect(calls[0]!.x).toBe(0);
    expect(calls[0]!.y).toBe(0);
    for (let i = 1; i <= 10; i++) {
      expect(calls[i]!.type).toBe('mouseMove');
    }
    expect(calls[10]!.x).toBe(100);
    expect(calls[10]!.y).toBe(50);
    expect(calls[11]!.type).toBe('mouseUp');
    expect(calls[11]!.x).toBe(100);
    expect(calls[11]!.y).toBe(50);
  });

  test('resize: ready -> {ok:true, actual:{width,height}}', () => {
    const wc = makeWc({});
    const ub = makeUserBrowser({ wc, ready: true });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    expect(svc.resize(800, 600)).toEqual({
      ok: true,
      actual: { width: 800, height: 600 },
    });
  });

  test('resize: not ready -> {ok:false, actual:{0,0}}', () => {
    const ub = makeUserBrowser({ wc: null, ready: false });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    expect(svc.resize(800, 600)).toEqual({
      ok: false,
      actual: { width: 0, height: 0 },
    });
  });

  test('resize: ready but no wc -> {ok:false, actual:{0,0}}', () => {
    const ub = makeUserBrowser({ wc: null, ready: true });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    expect(svc.resize(800, 600)).toEqual({
      ok: false,
      actual: { width: 0, height: 0 },
    });
  });

  test('getConsoleErrors: delegates to ConsoleCapture.get', () => {
    const wc = makeWc({});
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = svc.getConsoleErrors(123);
    expect((consoleCap.get as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(123);
    expect(r).toEqual([{ level: 'log', text: 'hi', ts: 123 }]);
  });

  test('getNetworkLog: delegates to NetworkCapture.get with mime filter', () => {
    const wc = makeWc({});
    const ub = makeUserBrowser({ wc });
    const svc = new BrowserAutomationService(ub, consoleCap, netCap);
    const r = svc.getNetworkLog(456, 'application/json');
    expect((netCap.get as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      456,
      'application/json',
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.mime).toBe('application/json');
  });

  // Reference: ensure unused import warning suppression — silence "WebContents unused"
  // by referring to the type. Vitest doesn't need this at runtime, but keeps the
  // import alive for tsc.
  test('type import sanity', () => {
    const w: WebContents | undefined = undefined;
    expect(w).toBeUndefined();
  });
});
