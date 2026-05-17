import { useState, useCallback, type ReactElement } from 'react';
import { useBrowserStore } from '../../renderer/store/browser';
import { useTask } from '../../renderer/store/task';
import type { BrowserMode } from '../../core/domain/browser';
import styles from './BrowserPanelConnected.module.css';

export function BrowserPanelConnected(): ReactElement {
  const taskId = useTask((s) => s.current?.id ?? '');
  const session = useBrowserStore((s) => s.activeSessions[taskId]);
  const openSession = useBrowserStore((s) => s.openSession);
  const closeSession = useBrowserStore((s) => s.closeSession);
  const navigate = useBrowserStore((s) => s.navigate);
  const captureScreenshot = useBrowserStore((s) => s.captureScreenshot);

  const [urlInput, setUrlInput] = useState('');
  const [mode, setMode] = useState<BrowserMode>('headless');
  const [busy, setBusy] = useState(false);

  const handleOpen = useCallback(async () => {
    if (!taskId) return;
    setBusy(true);
    try { await openSession(taskId, mode); } finally { setBusy(false); }
  }, [taskId, mode, openSession]);

  const handleClose = useCallback(async () => {
    if (!taskId) return;
    setBusy(true);
    try { await closeSession(taskId); } finally { setBusy(false); }
  }, [taskId, closeSession]);

  const handleNavigate = useCallback(async () => {
    if (!urlInput.trim() || !taskId) return;
    setBusy(true);
    try { await navigate(taskId, urlInput.trim()); } finally { setBusy(false); }
  }, [taskId, urlInput, navigate]);

  const handleScreenshot = useCallback(async () => {
    if (!taskId) return;
    setBusy(true);
    try { await captureScreenshot(taskId); } finally { setBusy(false); }
  }, [taskId, captureScreenshot]);

  if (!session) {
    return (
      <div className={styles.panel} data-testid="browser-panel">
        <div className={styles.header}>Browser</div>
        <div className={styles.openRow}>
          <select
            className={styles.modeSelect}
            value={mode}
            onChange={(e) => setMode(e.target.value as BrowserMode)}
            data-testid="browser-mode-select"
          >
            <option value="headless">Headless</option>
            <option value="embedded">Embedded</option>
          </select>
          <button
            type="button"
            className={styles.btn}
            onClick={() => void handleOpen()}
            disabled={busy || !taskId}
            data-testid="browser-open-btn"
          >
            Open browser
          </button>
        </div>
      </div>
    );
  }

  const events = [...session.events].reverse().slice(0, 50);

  return (
    <div className={styles.panel} data-testid="browser-panel">
      <div className={styles.header}>
        <span className={styles.modeBadge}>{session.mode}</span>
        <span className={styles.urlLabel}>{session.url ?? '—'}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => void handleClose()}
          disabled={busy}
          data-testid="browser-close-btn"
          aria-label="Close browser"
        >
          ×
        </button>
      </div>

      <div className={styles.navRow}>
        <input
          className={styles.urlInput}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://..."
          onKeyDown={(e) => { if (e.key === 'Enter') void handleNavigate(); }}
          data-testid="browser-url-input"
        />
        <button
          type="button"
          className={styles.btn}
          onClick={() => void handleNavigate()}
          disabled={busy || !urlInput.trim()}
          data-testid="browser-navigate-btn"
        >
          Go
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => void handleScreenshot()}
          disabled={busy}
          data-testid="browser-screenshot-btn"
          title="Capture screenshot"
        >
          📷
        </button>
      </div>

      {session.lastScreenshot && (
        <div className={styles.screenshotWrap}>
          <img
            src={session.lastScreenshot.dataUrl}
            alt="Browser screenshot"
            className={styles.screenshot}
            data-testid="browser-screenshot-img"
          />
        </div>
      )}

      {session.loading && <div className={styles.loading}>Loading…</div>}

      <div className={styles.eventList} data-testid="browser-event-list">
        {events.map((ev, i) => (
          <div key={i} className={styles.event}>
            <span className={styles.eventType}>{ev.type}</span>
            {ev.url && <span className={styles.eventUrl}>{ev.url}</span>}
            {ev.selector && <span className={styles.eventSel}>{ev.selector}</span>}
          </div>
        ))}
        {events.length === 0 && <span className={styles.noEvents}>No events yet</span>}
      </div>
    </div>
  );
}
