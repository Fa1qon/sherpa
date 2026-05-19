import { describe, it, expect, beforeEach } from 'vitest';

import {
  getMermaid,
  setMermaidTheme,
  _resetForTest,
} from '../../../../src/presentation/fileviewer/mermaid/mermaid_loader';

describe('mermaid_loader', () => {
  beforeEach(() => {
    _resetForTest();
  });

  it('loads mermaid once and reuses the instance', async () => {
    const a = await getMermaid();
    const b = await getMermaid();
    expect(a).toBe(b);
  });

  it('initializes with default config on first load', async () => {
    const m = await getMermaid();
    expect(m).toBeDefined();
    expect(m.render).toBeTypeOf('function');
    expect(m.initialize).toBeTypeOf('function');
  });

  it('setMermaidTheme re-initializes without throwing', async () => {
    await getMermaid();
    expect(() => setMermaidTheme('dark')).not.toThrow();
    // Switching back to the same theme is a no-op (no throw, no re-init).
    expect(() => setMermaidTheme('dark')).not.toThrow();
    expect(() => setMermaidTheme('light')).not.toThrow();
  });
});
