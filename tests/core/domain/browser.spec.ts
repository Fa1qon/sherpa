// tests/core/domain/browser.spec.ts
import { describe, test, expect } from 'vitest';
import type { BrowserMode, BrowserEvent, BrowserState } from '../../../src/core/domain/browser';
import type { BrowserPort } from '../../../src/core/ports/browser_port';

describe('browser domain types compile', () => {
  test('BrowserMode values', () => {
    const modes: BrowserMode[] = ['headless', 'embedded'];
    expect(modes).toHaveLength(2);
  });

  test('BrowserEvent shape', () => {
    const e: BrowserEvent = { type: 'navigate', url: 'https://example.com', ts: Date.now() };
    expect(e.type).toBe('navigate');
  });

  test('BrowserState shape', () => {
    const s: BrowserState = { sessionId: 'abc', mode: 'headless', url: null, loading: false, events: [] };
    expect(s.mode).toBe('headless');
  });
});
