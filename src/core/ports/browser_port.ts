import type { BrowserEvent } from '../domain/browser';

export interface ScreenshotResult {
  readonly dataUrl: string; // base64 PNG
  readonly width: number;
  readonly height: number;
}

export interface BrowserPort {
  navigate(url: string): Promise<void>;
  screenshot(): Promise<ScreenshotResult>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  evaluate<T>(script: string): Promise<T>;
  getDOM(): Promise<string>;
  waitFor(selector: string, timeoutMs?: number): Promise<void>;
  highlight(selector: string): Promise<void>;
  close(): Promise<void>;
  onEvent(handler: (event: BrowserEvent) => void): () => void; // returns unsubscribe
}
