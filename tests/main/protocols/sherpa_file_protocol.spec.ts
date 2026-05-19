// Visual Formats Plan 01 — Task 6.
//
// Unit tests for the pure `sherpa-file://` URL resolver. Intentionally does
// NOT import electron — only the pure resolver functions — so it runs cleanly
// under the vitest `node` environment.

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import {
  resolveSherpaFileUrl,
  setCurrentProjectPath,
} from '../../../src/main/protocols/sherpa_file_protocol';

describe('sherpa-file:// protocol resolver', () => {
  beforeEach(() => setCurrentProjectPath(null));

  it('returns null when no project is set', () => {
    expect(resolveSherpaFileUrl('sherpa-file://current/foo.png')).toBeNull();
  });

  it('resolves relative path against project root', () => {
    setCurrentProjectPath('C:/projects/demo');
    expect(resolveSherpaFileUrl('sherpa-file://current/assets/img.png'))
      .toBe(path.resolve('C:/projects/demo/assets/img.png'));
  });

  it('strips query and fragment', () => {
    setCurrentProjectPath('C:/projects/demo');
    expect(resolveSherpaFileUrl('sherpa-file://current/a.png?cache=1#x'))
      .toBe(path.resolve('C:/projects/demo/a.png'));
  });

  it('rejects path escape via ..', () => {
    setCurrentProjectPath('C:/projects/demo');
    expect(resolveSherpaFileUrl('sherpa-file://current/../../secret'))
      .toBeNull();
  });

  it('rejects unknown host (only "current" supported for now)', () => {
    setCurrentProjectPath('C:/projects/demo');
    expect(resolveSherpaFileUrl('sherpa-file://other/foo.png'))
      .toBeNull();
  });

  it('decodes URI components in path', () => {
    setCurrentProjectPath('C:/projects/demo');
    expect(resolveSherpaFileUrl('sherpa-file://current/a%20b/img.png'))
      .toBe(path.resolve('C:/projects/demo/a b/img.png'));
  });
});
