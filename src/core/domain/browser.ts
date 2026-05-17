export type BrowserMode = 'headless' | 'embedded';

export interface BrowserEvent {
  readonly type: 'navigate' | 'click' | 'input' | 'load' | 'error' | 'custom';
  readonly url?: string;
  readonly selector?: string;
  readonly value?: string;
  readonly data?: unknown;
  readonly ts: number;
}

export interface BrowserState {
  readonly sessionId: string;
  readonly mode: BrowserMode;
  readonly url: string | null;
  readonly loading: boolean;
  readonly events: readonly BrowserEvent[];
}
