// tests/main/services/user_browser.spec.ts
//
// v0.24.5 rewrite: UserBrowser is now a thin wrapper around a renderer-
// owned <webview> tag. Tests cover the new attachWebContents lifecycle
// (registers/clears webContentsId, fires onViewCreated, routes navigate/
// back/forward/reload through webContents.fromId).

import { describe, test, expect, vi, beforeEach } from 'vitest';

interface MockWebContents {
  loadURL: ReturnType<typeof vi.fn>;
  getURL: ReturnType<typeof vi.fn>;
  getTitle: ReturnType<typeof vi.fn>;
  canGoBack: ReturnType<typeof vi.fn>;
  canGoForward: ReturnType<typeof vi.fn>;
  goBack: ReturnType<typeof vi.fn>;
  goForward: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  session: { setProxy: ReturnType<typeof vi.fn> };
}

function makeMockWebContents(): MockWebContents {
  return {
    loadURL: vi.fn().mockResolvedValue(undefined),
    getURL: vi.fn().mockReturnValue(''),
    getTitle: vi.fn().mockReturnValue(''),
    canGoBack: vi.fn().mockReturnValue(true),
    canGoForward: vi.fn().mockReturnValue(true),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    session: { setProxy: vi.fn().mockResolvedValue(undefined) },
  };
}

const registry = new Map<number, MockWebContents>();

vi.mock('electron', () => ({
  webContents: {
    fromId: vi.fn((id: number) => registry.get(id) ?? null),
  },
}));

vi.mock('../../../src/main/services/proxy_manager', () => ({
  proxyManager: {
    getProxyUrl: vi.fn().mockReturnValue(null),
    getNoProxy: vi.fn().mockReturnValue(undefined),
  },
}));

import { UserBrowser } from '../../../src/main/services/user_browser';

describe('UserBrowser.attachWebContents', () => {
  let ub: UserBrowser;
  let wc: MockWebContents;

  beforeEach(() => {
    vi.clearAllMocks();
    registry.clear();
    ub = new UserBrowser();
    wc = makeMockWebContents();
    registry.set(42, wc);
  });

  test('isReady is false before attach', () => {
    expect(ub.isReady()).toBe(false);
  });

  test('getWebContents returns null before attach', () => {
    expect(ub.getWebContents()).toBeNull();
  });

  test('after attach, isReady is true and getWebContents resolves', () => {
    ub.attachWebContents(42);
    expect(ub.isReady()).toBe(true);
    expect(ub.getWebContents()).toBe(wc);
  });

  test('attach(null) clears the registration', () => {
    ub.attachWebContents(42);
    ub.attachWebContents(null);
    expect(ub.isReady()).toBe(false);
    expect(ub.getWebContents()).toBeNull();
  });

  test('attach registers did-navigate / did-navigate-in-page / page-title-updated listeners', () => {
    ub.attachWebContents(42);
    const events = wc.on.mock.calls.map((c) => c[0]);
    expect(events).toContain('did-navigate');
    expect(events).toContain('did-navigate-in-page');
    expect(events).toContain('page-title-updated');
  });

  test('re-attaching to a different webContents clears the previous listeners', () => {
    ub.attachWebContents(42);
    const wc2 = makeMockWebContents();
    registry.set(43, wc2);

    ub.attachWebContents(43);
    expect(wc.removeAllListeners).toHaveBeenCalled();
    expect(ub.getWebContents()).toBe(wc2);
  });

  test('getWebContents returns null and clears id if the contents was destroyed', () => {
    ub.attachWebContents(42);
    wc.isDestroyed.mockReturnValue(true);
    expect(ub.getWebContents()).toBeNull();
  });
});

describe('UserBrowser navigation methods', () => {
  let ub: UserBrowser;
  let wc: MockWebContents;

  beforeEach(() => {
    vi.clearAllMocks();
    registry.clear();
    ub = new UserBrowser();
    wc = makeMockWebContents();
    registry.set(42, wc);
    ub.attachWebContents(42);
  });

  test('navigate calls loadURL on the attached webContents', () => {
    ub.navigate('https://example.com');
    expect(wc.loadURL).toHaveBeenCalledWith('https://example.com');
  });

  test('back / forward / reload route through the webContents', () => {
    ub.back();
    expect(wc.goBack).toHaveBeenCalledTimes(1);
    ub.forward();
    expect(wc.goForward).toHaveBeenCalledTimes(1);
    ub.reload();
    expect(wc.reload).toHaveBeenCalledTimes(1);
  });

  test('back is a no-op when canGoBack is false', () => {
    wc.canGoBack.mockReturnValue(false);
    ub.back();
    expect(wc.goBack).not.toHaveBeenCalled();
  });

  test('forward is a no-op when canGoForward is false', () => {
    wc.canGoForward.mockReturnValue(false);
    ub.forward();
    expect(wc.goForward).not.toHaveBeenCalled();
  });

  test('navigation methods are no-ops with no attached webContents', () => {
    ub.attachWebContents(null);
    ub.navigate('https://example.com');
    ub.back();
    ub.forward();
    ub.reload();
    expect(wc.loadURL).not.toHaveBeenCalled();
    expect(wc.goBack).not.toHaveBeenCalled();
  });
});

describe('UserBrowser.onViewCreated', () => {
  let ub: UserBrowser;
  let wc: MockWebContents;

  beforeEach(() => {
    vi.clearAllMocks();
    registry.clear();
    ub = new UserBrowser();
    wc = makeMockWebContents();
    registry.set(42, wc);
  });

  test('invokes handler immediately if webContents is already attached', () => {
    ub.attachWebContents(42);
    const handler = vi.fn();
    ub.onViewCreated(handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(wc);
  });

  test('invokes handler on first attach if not yet attached', () => {
    const handler = vi.fn();
    ub.onViewCreated(handler);
    expect(handler).not.toHaveBeenCalled();

    ub.attachWebContents(42);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(wc);
  });

  test('handler does NOT fire again on subsequent re-attach', () => {
    const handler = vi.fn();
    ub.onViewCreated(handler);
    ub.attachWebContents(42);
    expect(handler).toHaveBeenCalledTimes(1);

    const wc2 = makeMockWebContents();
    registry.set(43, wc2);
    ub.attachWebContents(43);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('disposer removes a pending handler before attach', () => {
    const handler = vi.fn();
    const dispose = ub.onViewCreated(handler);
    dispose();

    ub.attachWebContents(42);
    expect(handler).not.toHaveBeenCalled();
  });

  test('multiple handlers fire in registration order on attach', () => {
    const calls: string[] = [];
    ub.onViewCreated(() => calls.push('a'));
    ub.onViewCreated(() => calls.push('b'));
    ub.onViewCreated(() => calls.push('c'));

    ub.attachWebContents(42);
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  test('a throwing handler does not block subsequent handlers', () => {
    const ok1 = vi.fn();
    const ok2 = vi.fn();
    ub.onViewCreated(() => { throw new Error('boom'); });
    ub.onViewCreated(ok1);
    ub.onViewCreated(ok2);

    ub.attachWebContents(42);
    expect(ok1).toHaveBeenCalledTimes(1);
    expect(ok2).toHaveBeenCalledTimes(1);
  });
});

describe('UserBrowser legacy show/hide', () => {
  test('show is a no-op for positioning (CSS handles layout now)', () => {
    const ub = new UserBrowser();
    expect(() => ub.show(0, 0, 800, 600)).not.toThrow();
    expect(ub.isReady()).toBe(false);  // no implicit attach
  });

  test('show with a URL navigates the attached webContents if any', () => {
    const wc = makeMockWebContents();
    registry.set(42, wc);
    const ub = new UserBrowser();
    ub.attachWebContents(42);

    ub.show(0, 0, 800, 600, 'https://example.com');
    expect(wc.loadURL).toHaveBeenCalledWith('https://example.com');
  });

  test('hide is a no-op (webview unmounts with React)', () => {
    const ub = new UserBrowser();
    expect(() => ub.hide()).not.toThrow();
  });
});
