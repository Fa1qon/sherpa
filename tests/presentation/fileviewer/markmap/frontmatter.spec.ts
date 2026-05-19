import { describe, it, expect } from 'vitest';
import { parseFrontmatter, isMindmapDoc } from '../../../../src/presentation/fileviewer/markmap/frontmatter';

describe('frontmatter', () => {
  it('returns null when no frontmatter', () => {
    expect(parseFrontmatter('# Hello\n')).toEqual({ data: null, body: '# Hello\n' });
  });

  it('parses simple key/value frontmatter', () => {
    const src = '---\nview: mindmap\ntitle: Plan\n---\n\n# H1';
    const { data, body } = parseFrontmatter(src);
    expect(data).toEqual({ view: 'mindmap', title: 'Plan' });
    expect(body).toBe('\n# H1');
  });

  it('isMindmapDoc detects view: mindmap', () => {
    expect(isMindmapDoc('---\nview: mindmap\n---\n# H')).toBe(true);
    expect(isMindmapDoc('---\nview: doc\n---\n# H')).toBe(false);
    expect(isMindmapDoc('# H')).toBe(false);
  });

  it('handles quoted values', () => {
    const { data } = parseFrontmatter('---\nview: "mindmap"\n---\nbody');
    expect(data).toEqual({ view: 'mindmap' });
  });

  it('handles missing closing fence gracefully', () => {
    expect(parseFrontmatter('---\nbroken\n').data).toBeNull();
  });
});
