// src/main/services/network_capture.ts
//
// Passive ring-buffer collector for HTTP(S) requests made by an Electron
// Session. Used by BrowserAutomationService to expose recent network
// activity of the embedded UserBrowser tab to AI agents.
//
// We hook `session.webRequest.onBeforeRequest` to record the start of a
// request, and `session.webRequest.onCompleted` to finalize the entry with
// status code, mime, response size and duration. Requests that complete
// without a matching onBeforeRequest (unknown id) are ignored — they
// shouldn't happen in practice but we defend against it.
//
// `attach()` returns a disposer that detaches both listeners by passing
// `null` to `onBeforeRequest`/`onCompleted` (per Electron docs / typings).

import type { Session } from 'electron';

export interface NetworkEntry {
  id: string;
  url: string;
  method: string;
  status?: number;
  mime?: string;
  durationMs?: number;
  sizeBytes?: number;
  ts: number;
}

interface PendingRequest {
  url: string;
  method: string;
  startTs: number;
}

/**
 * Looks up a header value tolerating both lower-case and Title-Case header
 * names (Electron normalizes inconsistently across platforms/versions).
 */
function header(
  headers: Record<string, string[]> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : (v as unknown as string);
    }
  }
  return undefined;
}

export class NetworkCapture {
  private buf: NetworkEntry[] = [];
  private pending = new Map<string, PendingRequest>();
  private readonly MAX: number;

  constructor(max = 1000) {
    this.MAX = max;
  }

  attach(session: Session): () => void {
    session.webRequest.onBeforeRequest((details, cb) => {
      this.pending.set(String(details.id), {
        url: details.url,
        method: details.method,
        startTs: Date.now(),
      });
      cb({});
    });

    session.webRequest.onCompleted((details) => {
      const start = this.pending.get(String(details.id));
      if (!start) return;
      this.pending.delete(String(details.id));

      const headers = details.responseHeaders as
        | Record<string, string[]>
        | undefined;
      const mime = header(headers, 'content-type');
      const len = header(headers, 'content-length');
      const sizeBytes = len !== undefined ? Number(len) || undefined : undefined;

      const entry: NetworkEntry = {
        id: String(details.id),
        url: start.url,
        method: start.method,
        status: details.statusCode,
        mime,
        durationMs: Date.now() - start.startTs,
        sizeBytes,
        ts: start.startTs,
      };
      this.push(entry);
    });

    return () => {
      // Per Electron docs/typings, passing `null` removes the registered
      // listener for that hook.
      session.webRequest.onBeforeRequest(null);
      session.webRequest.onCompleted(null);
      this.pending.clear();
    };
  }

  get(sinceMs?: number, filterMime?: string): NetworkEntry[] {
    let r = sinceMs === undefined ? [...this.buf] : this.buf.filter((e) => e.ts >= sinceMs);
    if (filterMime) r = r.filter((e) => e.mime?.startsWith(filterMime));
    return r;
  }

  clear(): void {
    this.buf = [];
  }

  private push(entry: NetworkEntry): void {
    this.buf.push(entry);
    if (this.buf.length > this.MAX) this.buf.shift();
  }
}
