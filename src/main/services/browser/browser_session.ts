import { EventEmitter } from 'node:events';
import type { BrowserPort } from '../../../core/ports/browser_port';
import type { BrowserEvent, BrowserMode } from '../../../core/domain/browser';

export class BrowserSession {
  private emitter = new EventEmitter();
  private unsub: (() => void) | null = null;

  constructor(
    public readonly sessionId: string,
    public readonly mode: BrowserMode,
    private readonly backend: BrowserPort,
  ) {
    this.unsub = backend.onEvent((ev) => this.emitter.emit('event', ev));
  }

  onEvent(handler: (ev: BrowserEvent) => void): () => void {
    this.emitter.on('event', handler);
    return () => this.emitter.off('event', handler);
  }

  get port(): BrowserPort {
    return this.backend;
  }

  async close(): Promise<void> {
    this.unsub?.();
    this.emitter.removeAllListeners();
    await this.backend.close();
  }
}
