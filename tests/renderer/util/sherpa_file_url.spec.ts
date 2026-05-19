import { describe, it, expect } from 'vitest';
import { toSherpaFileUrl, isRelativeMdImg } from '../../../src/renderer/util/sherpa_file_url';

describe('sherpa_file_url', () => {
  it('builds URL for relative path', () => {
    expect(toSherpaFileUrl('docs/img.png', 'spec.md')).toBe(
      'sherpa-file://current/docs/img.png',
    );
  });

  it('resolves ./ relative to document', () => {
    expect(toSherpaFileUrl('./img.png', 'docs/spec.md')).toBe(
      'sherpa-file://current/docs/img.png',
    );
  });

  it('resolves ../ relative to document', () => {
    expect(toSherpaFileUrl('../assets/img.png', 'docs/sub/spec.md')).toBe(
      'sherpa-file://current/docs/assets/img.png',
    );
  });

  it('passes absolute http(s) URLs through', () => {
    expect(toSherpaFileUrl('https://x.io/img.png', 'spec.md')).toBe(
      'https://x.io/img.png',
    );
  });

  it('passes data: URLs through', () => {
    expect(toSherpaFileUrl('data:image/png;base64,xx', 'spec.md')).toBe(
      'data:image/png;base64,xx',
    );
  });

  it('returns null when src is empty', () => {
    expect(toSherpaFileUrl('', 'spec.md')).toBeNull();
  });

  it('isRelativeMdImg detects relative img src', () => {
    expect(isRelativeMdImg('./a.png')).toBe(true);
    expect(isRelativeMdImg('a.png')).toBe(true);
    expect(isRelativeMdImg('/abs')).toBe(false);
    expect(isRelativeMdImg('https://x')).toBe(false);
  });
});
