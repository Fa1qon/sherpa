import { describe, it, expect, beforeEach } from 'vitest';
import { getHighlighter, _resetForTest } from '../../../../src/presentation/fileviewer/markdown/shiki_loader';

describe('shiki_loader', () => {
  beforeEach(() => _resetForTest());

  it('returns same instance on second call', async () => {
    const a = await getHighlighter();
    const b = await getHighlighter();
    expect(a).toBe(b);
  });

  it('highlights known language', async () => {
    const h = await getHighlighter();
    const html = h.codeToHtml('const x = 1', { lang: 'javascript', theme: 'github-dark' });
    expect(html).toContain('<pre');
    expect(html).toContain('const');
  });

  it('throws on unknown lang', async () => {
    const h = await getHighlighter();
    expect(() => h.codeToHtml('xyz', { lang: 'klingon' as never, theme: 'github-dark' })).toThrow();
  });
});
