// src/presentation/screens/BrowserTab/BrowserTab.tsx
// User-facing embedded browser. Positions a native WebContentsView (managed
// by the main process) over the viewport div. The React component owns only
// the URL toolbar; the actual browser rendering is native.

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
import styles from './BrowserTab.module.css';

interface Props {
  initialUrl?: string;
}

type UBrowser = NonNullable<
  NonNullable<(Window & { sherpa?: { ubrowser?: unknown } })['sherpa']>['ubrowser']
>;

function getUBrowser(): UBrowser | undefined {
  return (window as Window & { sherpa?: { ubrowser?: UBrowser } }).sherpa?.ubrowser;
}

export function BrowserTab({ initialUrl = 'about:blank' }: Props): ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [urlInput, setUrlInput] = useState(initialUrl);
  const pendingUrlRef = useRef<string>(initialUrl);

  // Sync bounds of the native view to the viewport div position/size.
  // Polling at 200 ms catches sidebar resizes (position change without
  // a ResizeObserver hit) cheaply — skips IPC when bounds are unchanged.
  const prevBoundsRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const syncBounds = useCallback((loadUrl?: string) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left);
    const y = Math.round(rect.top);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const prev = prevBoundsRef.current;
    const unchanged = prev.x === x && prev.y === y && prev.w === w && prev.h === h && !loadUrl;
    if (unchanged) return;
    prevBoundsRef.current = { x, y, w, h };
    void getUBrowser()?.show(x, y, w, h, loadUrl);
  }, []);

  // Show the native view; hide when unmounting (different tab or window close).
  useEffect(() => {
    syncBounds(pendingUrlRef.current);
    const id = setInterval(() => syncBounds(), 200);
    return () => {
      clearInterval(id);
      void getUBrowser()?.hide();
    };
  }, [syncBounds]);

  // Listen for navigation events pushed from the main process.
  useEffect(() => {
    return getUBrowser()?.onUrlChanged((url: string) => {
      setUrlInput(url);
      pendingUrlRef.current = url;
    });
  }, []);

  const navigate = useCallback((raw: string) => {
    let url = raw.trim();
    if (!url) return;
    if (!url.startsWith('file://') && !url.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//)) {
      url = 'https://' + url;
    }
    setUrlInput(url);
    pendingUrlRef.current = url;
    void getUBrowser()?.navigate(url);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') navigate(urlInput);
    },
    [navigate, urlInput],
  );

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value);
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.navBtn}
          title="Back"
          onClick={() => void getUBrowser()?.back()}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          title="Forward"
          onClick={() => void getUBrowser()?.forward()}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          title="Reload"
          onClick={() => void getUBrowser()?.reload()}
        >
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
      </div>
      {/* The native WebContentsView is overlaid over this div by the main process. */}
      <div ref={viewportRef} className={styles.viewport} />
    </div>
  );
}
