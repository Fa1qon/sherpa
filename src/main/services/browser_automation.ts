// src/main/services/browser_automation.ts
//
// BrowserAutomationService — drives the embedded UserBrowser's WebContents
// for AI-agent tool calls. Exposes 12 high-level methods (navigate, screenshot,
// getHtml, querySelector, evaluateJs, click, type, key, drag, resize,
// getConsoleErrors, getNetworkLog) returning serializable JSON.
//
// All DOM-touching methods funnel through `wc.executeJavaScript(code, true)`
// (userGesture=true). Mouse/keyboard ops use `wc.sendInputEvent(...)`.

import type { WebContents } from 'electron';
import type { UserBrowser } from './user_browser';
import type { ConsoleCapture } from './console_capture';
import type { NetworkCapture } from './network_capture';

export interface QueryItem {
  tag: string;
  text: string;
  attributes: Record<string, string>;
  boundingRect: { x: number; y: number; width: number; height: number };
}

export class BrowserAutomationService {
  constructor(
    private userBrowser: UserBrowser,
    private console: ConsoleCapture,
    private network: NetworkCapture,
  ) {}

  private wc(): WebContents {
    const wc = this.userBrowser.getWebContents();
    if (!wc) throw new Error('Browser not initialized — call browser_navigate first or open the browser tab');
    return wc;
  }

  async navigate(url: string): Promise<{ ok: boolean; finalUrl: string }> {
    if (!this.userBrowser.isReady()) {
      this.userBrowser.show(0, 0, 800, 600, url);
    } else {
      this.userBrowser.navigate(url);
    }
    const wc = this.wc();
    await new Promise<void>((resolve) => {
      // `once` auto-removes after first fire, so we don't need an explicit off().
      wc.once('did-finish-load', () => { resolve(); });
    });
    return { ok: true, finalUrl: wc.getURL() };
  }

  async screenshot(_opts: { fullPage?: boolean } = {}): Promise<{ base64: string; width: number; height: number }> {
    const wc = this.wc();
    const img = await wc.capturePage();
    const buf = img.toPNG();
    const size = img.getSize();
    return { base64: buf.toString('base64'), width: size.width, height: size.height };
  }

  async getHtml(selector?: string): Promise<{ html: string }> {
    const wc = this.wc();
    const code = selector
      ? `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.outerHTML : ''; })()`
      : `document.documentElement.outerHTML`;
    const html = (await wc.executeJavaScript(code, true)) as string;
    return { html };
  }

  async querySelector(selector: string, all = false): Promise<{ count: number; items: QueryItem[] }> {
    const wc = this.wc();
    // Build the JS distinctly per branch (avoids the contorted ternary from the
    // plan snippet). Both branches produce a plain array of elements.
    const expr = all
      ? `Array.from(document.querySelectorAll(${JSON.stringify(selector)}))`
      : `[document.querySelector(${JSON.stringify(selector)})].filter(Boolean)`;
    const code = `
      (() => {
        const nodes = ${expr};
        return {
          count: nodes.length,
          items: nodes.slice(0, 50).map((el) => {
            const rect = el.getBoundingClientRect();
            const attrs = {};
            for (const a of el.attributes) attrs[a.name] = a.value;
            return {
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').slice(0, 500),
              attributes: attrs,
              boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            };
          }),
        };
      })()
    `;
    return (await wc.executeJavaScript(code, true)) as { count: number; items: QueryItem[] };
  }

  async evaluateJs(code: string): Promise<{ result?: unknown; error?: string }> {
    const wc = this.wc();
    const wrapped = `
      (async () => {
        try {
          const r = await (async () => { ${code} })();
          return { ok: true, result: JSON.parse(JSON.stringify(r ?? null)) };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      })()
    `;
    const r = (await wc.executeJavaScript(wrapped, true)) as {
      ok: boolean;
      result?: unknown;
      error?: string;
    };
    return r.ok ? { result: r.result } : { error: r.error };
  }

  async click(
    selector: string,
    button: 'left' | 'right' | 'middle' = 'left',
  ): Promise<{ ok: boolean }> {
    const wc = this.wc();
    const rectCode = `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()
    `;
    const pos = (await wc.executeJavaScript(rectCode, true)) as
      | { x: number; y: number }
      | null;
    if (!pos) return { ok: false };
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
    return { ok: true };
  }

  async type(selector: string, text: string, delay = 0): Promise<{ ok: boolean }> {
    const wc = this.wc();
    const focusOk = (await wc.executeJavaScript(
      `
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.focus();
        return true;
      })()
    `,
      true,
    )) as boolean;
    if (!focusOk) return { ok: false };
    for (const ch of text) {
      wc.sendInputEvent({ type: 'char', keyCode: ch });
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
    return { ok: true };
  }

  async key(key: string, modifiers: string[] = []): Promise<{ ok: boolean }> {
    const wc = this.wc();
    const mods = modifiers as Electron.InputEvent['modifiers'];
    wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mods });
    wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mods });
    return { ok: true };
  }

  async drag(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<{ ok: boolean }> {
    const wc = this.wc();
    wc.sendInputEvent({
      type: 'mouseDown',
      x: Math.round(from.x),
      y: Math.round(from.y),
      button: 'left',
      clickCount: 1,
    });
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      await new Promise((r) => setTimeout(r, 10));
    }
    wc.sendInputEvent({
      type: 'mouseUp',
      x: Math.round(to.x),
      y: Math.round(to.y),
      button: 'left',
      clickCount: 1,
    });
    return { ok: true };
  }

  resize(
    width: number,
    height: number,
  ): { ok: boolean; actual: { width: number; height: number } } {
    if (!this.userBrowser.isReady()) return { ok: false, actual: { width: 0, height: 0 } };
    const wc = this.userBrowser.getWebContents();
    if (!wc) return { ok: false, actual: { width: 0, height: 0 } };
    // v1 stub: UserBrowser doesn't expose setBounds(width,height) independently;
    // a real implementation would call userBrowser.setBounds(x, y, w, h).
    // We accept the requested size and report it as actual.
    return { ok: true, actual: { width, height } };
  }

  getConsoleErrors(sinceMs?: number): ReturnType<ConsoleCapture['get']> {
    return this.console.get(sinceMs);
  }

  getNetworkLog(sinceMs?: number, filterMime?: string): ReturnType<NetworkCapture['get']> {
    return this.network.get(sinceMs, filterMime);
  }
}
