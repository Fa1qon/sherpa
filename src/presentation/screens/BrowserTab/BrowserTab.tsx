// src/presentation/screens/BrowserTab/BrowserTab.tsx
//
// User-facing embedded browser. Rewritten in v0.24.5 to use Electron's
// <webview> tag instead of overlaying a native WebContentsView. The tag
// lives inside React's DOM, so CSS handles position and size — no
// coordinate sync, no setBounds, no DPI conversion, no chrome offset.
//
// The webview's webContentsId is registered with the main process on
// 'dom-ready' so existing user_browser_* MCP tools (browser automation)
// can still drive it via webContents.fromId(id).

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactElement,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Globe } from 'lucide-react';
import { SlotOutlet } from '../../extensions/SlotOutlet';
import styles from './BrowserTab.module.css';

interface Props {
  initialUrl?: string;
}

// Subset of Electron.WebviewTag we use. Avoids depending on @types/electron
// in the renderer (Electron types are main-process-flavoured).
interface WebviewElement extends HTMLElement {
  src: string;
  loadURL(url: string): Promise<void>;
  goBack(): void;
  goForward(): void;
  reload(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getURL(): string;
  getTitle(): string;
  getWebContentsId(): number;
  addEventListener(
    type: 'dom-ready' | 'did-navigate' | 'did-navigate-in-page' | 'page-title-updated' | 'did-fail-load',
    listener: (event: Event & { url?: string; title?: string }) => void,
  ): void;
  removeEventListener(type: string, listener: EventListener): void;
}

function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  if (url.startsWith('file://')) return url;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) return url;
  return 'https://' + url;
}

export function BrowserTab({ initialUrl = 'about:blank' }: Props): ReactElement {
  const webviewRef = useRef<WebviewElement | null>(null);
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [ready, setReady] = useState(false);

  // Register webview's webContentsId with main process so MCP tools can
  // access it via webContents.fromId.
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    let cancelled = false;

    const onDomReady = (): void => {
      if (cancelled) return;
      setReady(true);
      try {
        const id = wv.getWebContentsId();
        void window.sherpa?.ubrowser?.registerWebContentsId?.(id);
      } catch { /* webview not fully initialized yet */ }
    };
    const onNavigate = (e: Event & { url?: string }): void => {
      if (e.url) setUrlInput(e.url);
    };

    wv.addEventListener('dom-ready', onDomReady);
    wv.addEventListener('did-navigate', onNavigate);
    wv.addEventListener('did-navigate-in-page', onNavigate);

    return () => {
      cancelled = true;
      wv.removeEventListener('dom-ready', onDomReady as EventListener);
      wv.removeEventListener('did-navigate', onNavigate as EventListener);
      wv.removeEventListener('did-navigate-in-page', onNavigate as EventListener);
      // Unregister on unmount so MCP calls don't hit a dead webContents.
      void window.sherpa?.ubrowser?.registerWebContentsId?.(null);
    };
  }, []);

  const navigate = useCallback((raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    setUrlInput(url);
    const wv = webviewRef.current;
    if (wv && ready) {
      void wv.loadURL(url).catch(() => { /* best-effort */ });
    } else if (wv) {
      wv.src = url;
    }
  }, [ready]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') navigate(urlInput);
    },
    [navigate, urlInput],
  );

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value);
  }, []);

  const goBack = useCallback(() => {
    const wv = webviewRef.current;
    if (wv && ready && wv.canGoBack()) wv.goBack();
  }, [ready]);

  const goForward = useCallback(() => {
    const wv = webviewRef.current;
    if (wv && ready && wv.canGoForward()) wv.goForward();
  }, [ready]);

  const reload = useCallback(() => {
    if (ready) webviewRef.current?.reload();
  }, [ready]);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.navBtn} title="Back" onClick={goBack}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className={styles.navBtn} title="Forward" onClick={goForward}>
          <ChevronRight size={16} />
        </button>
        <button type="button" className={styles.navBtn} title="Reload" onClick={reload}>
          <RotateCw size={16} />
        </button>
        <div className={styles.urlBar}>
          <Globe size={13} className={styles.globeIcon} aria-hidden="true" />
          <input
            className={styles.urlInput}
            value={urlInput}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Enter URL…"
            spellCheck={false}
          />
          <button
            type="button"
            className={styles.goBtn}
            onClick={() => navigate(urlInput)}
            title="Go"
          >
            Go
          </button>
        </div>
        <SlotOutlet slot="browser.toolbar" props={{ currentUrl: urlInput }} />
      </div>
      {/* The webview tag — sized by CSS via .webview rule, no coord sync. */}
      <webview
        ref={(el) => { webviewRef.current = el as unknown as WebviewElement | null; }}
        src={initialUrl}
        className={styles.webview}
        allowpopups
        data-testid="browser-webview"
      />
    </div>
  );
}
