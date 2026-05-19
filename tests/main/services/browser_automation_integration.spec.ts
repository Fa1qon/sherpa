// tests/main/services/browser_automation_integration.spec.ts
//
// Unit-level integration smoke for Task 7 wiring:
//
//   UserBrowser.show()  --(onViewCreated)-->  ConsoleCapture.attach(wc)
//                                             NetworkCapture.attach(wc.session)
//
//   wc emits 'console-message'              --> automation.getConsoleErrors()
//   session.webRequest onBeforeRequest/onCompleted
//                                            --> automation.getNetworkLog()
//
// We deliberately don't load Electron. We mock the `electron` module so
// `new WebContentsView()` returns an EventEmitter-shaped stub whose
// `webContents` exposes the surface the captures actually use:
//   - `on(event, listener)` (EventEmitter — for console-message)
//   - `session.webRequest.onBeforeRequest(listener)`
//   - `session.webRequest.onCompleted(listener)`
//
// Then we drive a fake `console-message` event and a fake webRequest pair
// through the mocked WebContents/Session and check the public service methods.

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mocks (must be declared before the SUT imports — vi.mock is hoisted)
// ---------------------------------------------------------------------------

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
  setProxy: ReturnType<typeof vi.fn>;
  webRequest: {
    onBeforeRequest: (l: BeforeListener) => void;
    onCompleted: (l: CompletedListener) => void;
  };
}

interface MockWebContents extends EventEmitter {
  session: MockSession;
  loadURL: ReturnType<typeof vi.fn>;
  getURL: ReturnType<typeof vi.fn>;
  getTitle: ReturnType<typeof vi.fn>;
  canGoBack: ReturnType<typeof vi.fn>;
  canGoForward: ReturnType<typeof vi.fn>;
  goBack: ReturnType<typeof vi.fn>;
  goForward: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  sendInputEvent: ReturnType<typeof vi.fn>;
  executeJavaScript: ReturnType<typeof vi.fn>;
  capturePage: ReturnType<typeof vi.fn>;
}

interface MockView {
  webContents: MockWebContents;
  setBounds: ReturnType<typeof vi.fn>;
  setVisible: ReturnType<typeof vi.fn>;
}

function makeMockSession(): MockSession {
  const m: MockSession = {
    beforeListener: null,
    completedListener: null,
    setProxy: vi.fn().mockResolvedValue(undefined),
    webRequest: {
      onBeforeRequest: (l: BeforeListener) => { m.beforeListener = l; },
      onCompleted: (l: CompletedListener) => { m.completedListener = l; },
    },
  };
  return m;
}

function makeMockWebContents(): MockWebContents {
  const ee = new EventEmitter() as MockWebContents;
  ee.session = makeMockSession();
  ee.loadURL = vi.fn().mockResolvedValue(undefined);
  ee.getURL = vi.fn().mockReturnValue('about:blank');
  ee.getTitle = vi.fn().mockReturnValue('');
  ee.canGoBack = vi.fn().mockReturnValue(false);
  ee.canGoForward = vi.fn().mockReturnValue(false);
  ee.goBack = vi.fn();
  ee.goForward = vi.fn();
  ee.reload = vi.fn();
  ee.close = vi.fn();
  ee.sendInputEvent = vi.fn();
  ee.executeJavaScript = vi.fn().mockResolvedValue(null);
  ee.capturePage = vi.fn().mockResolvedValue({
    toPNG: () => Buffer.from(''),
    getSize: () => ({ width: 0, height: 0 }),
  });
  return ee;
}

// v0.24.5: UserBrowser no longer creates a WebContentsView. The webview
// lives in the renderer; main process gets its webContents via
// electron.webContents.fromId. Tests stage a mock and register it
// against an id; attachWebContents(id) then wires everything up.
const sharedMockView: { current: MockView | null } = { current: null };
const wcRegistry = new Map<number, ReturnType<typeof makeMockWebContents>>();

vi.mock('electron', () => ({
  webContents: {
    fromId: vi.fn((id: number) => wcRegistry.get(id) ?? null),
  },
}));

// proxy_manager pulls electron-app-paths; stub to avoid main-process bootstrap.
vi.mock('../../../src/main/services/proxy_manager', () => ({
  proxyManager: {
    getProxyUrl: vi.fn().mockReturnValue(null),
    getNoProxy: vi.fn().mockReturnValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// SUT imports (after mocks)
// ---------------------------------------------------------------------------

import { UserBrowser } from '../../../src/main/services/user_browser';
import { ConsoleCapture } from '../../../src/main/services/console_capture';
import { NetworkCapture } from '../../../src/main/services/network_capture';
import { BrowserAutomationService } from '../../../src/main/services/browser_automation';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const mockBrowserWindow = {
  contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 1440, height: 900 }),
  getContentBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 1440, height: 900 }),
} as never;

// Helper: register a fresh mock webContents under an id, then attach it.
// Returns the mock view so tests can drive console/network events.
function stageView(ub: UserBrowser, id: number): MockView {
  const wc = makeMockWebContents();
  wcRegistry.set(id, wc);
  const view: MockView = { webContents: wc, setBounds: vi.fn(), setVisible: vi.fn() };
  sharedMockView.current = view;
  ub.attachWebContents(id);
  return view;
}

describe('BrowserAutomationService — wiring integration', () => {
  let ub: UserBrowser;
  let consoleCap: ConsoleCapture;
  let networkCap: NetworkCapture;
  let automation: BrowserAutomationService;

  beforeEach(() => {
    vi.clearAllMocks();
    wcRegistry.clear();
    sharedMockView.current = null;

    ub = new UserBrowser();
    ub.setMainWindow(mockBrowserWindow);

    consoleCap = new ConsoleCapture();
    networkCap = new NetworkCapture();
    automation = new BrowserAutomationService(ub, consoleCap, networkCap);

    // The wiring under test (mirrors handlers.ts startup block):
    ub.onViewCreated((wc) => {
      consoleCap.attach(wc);
      networkCap.attach(wc.session);
    });
  });

  test('onViewCreated fires on first show() and ConsoleCapture sees console events', () => {
    expect(automation.getConsoleErrors()).toEqual([]);

    stageView(ub, 42);

    const view = sharedMockView.current;
    expect(view).not.toBeNull();
    // ConsoleCapture should have subscribed to console-message on the wc.
    expect(view!.webContents.listenerCount('console-message')).toBe(1);

    // Drive a fake console-message through the mocked WebContents.
    view!.webContents.emit('console-message', {
      message: 'integration-test-error',
      level: 'error',
      lineNumber: 7,
      sourceId: 'integration.spec.ts',
    });

    const errors = automation.getConsoleErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].level).toBe('error');
    expect(errors[0].text).toBe('integration-test-error');
    expect(errors[0].line).toBe(7);
    expect(errors[0].source).toBe('integration.spec.ts');
  });

  test('NetworkCapture sees webRequest pairs through the wired session', () => {
    expect(automation.getNetworkLog()).toEqual([]);

    stageView(ub, 42);

    const view = sharedMockView.current;
    expect(view).not.toBeNull();
    const session = view!.webContents.session;

    // NetworkCapture should have registered both listeners.
    expect(session.beforeListener).not.toBeNull();
    expect(session.completedListener).not.toBeNull();

    session.beforeListener!(
      { id: 42, url: 'https://example.test/page', method: 'GET' },
      () => { /* cb */ },
    );
    session.completedListener!({
      id: 42,
      statusCode: 200,
      responseHeaders: {
        'content-type': ['text/html; charset=utf-8'],
        'content-length': ['256'],
      },
    });

    const log = automation.getNetworkLog();
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe('42');
    expect(log[0].url).toBe('https://example.test/page');
    expect(log[0].method).toBe('GET');
    expect(log[0].status).toBe(200);
    expect(log[0].mime).toBe('text/html; charset=utf-8');
    expect(log[0].sizeBytes).toBe(256);
  });

  test('filterMime parameter on getNetworkLog passes through to NetworkCapture', () => {
    stageView(ub, 42);
    const session = sharedMockView.current!.webContents.session;

    const fire = (id: number, url: string, mime: string): void => {
      session.beforeListener!({ id, url, method: 'GET' }, () => { /* cb */ });
      session.completedListener!({
        id,
        statusCode: 200,
        responseHeaders: { 'content-type': [mime] },
      });
    };

    fire(1, 'https://x/a.html', 'text/html');
    fire(2, 'https://x/b.json', 'application/json');
    fire(3, 'https://x/c.css', 'text/css');

    const onlyText = automation.getNetworkLog(undefined, 'text/');
    expect(onlyText.map((e) => e.url)).toEqual(['https://x/a.html', 'https://x/c.css']);
  });

  test('sinceMs parameter on getConsoleErrors passes through to ConsoleCapture', async () => {
    stageView(ub, 42);
    const wc = sharedMockView.current!.webContents;

    wc.emit('console-message', { message: 'first', level: 'error' });
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    wc.emit('console-message', { message: 'second', level: 'error' });

    const since = automation.getConsoleErrors(cutoff);
    expect(since).toHaveLength(1);
    expect(since[0].text).toBe('second');
  });
});
