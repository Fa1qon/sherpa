import { describe, it, expect } from 'vitest';
import { isValidPermission, expandPermissionPattern, checkPermission } from '../../../src/core/domain/extension_permissions';

describe('extension_permissions', () => {
  it('accepts known permission strings', () => {
    expect(isValidPermission('filesystem.read.project')).toBe(true);
    expect(isValidPermission('network.fetch.https')).toBe(true);
    expect(isValidPermission('ipc.call:git.*')).toBe(true);
    expect(isValidPermission('storage.local')).toBe(true);
  });

  it('rejects unknown permission categories', () => {
    expect(isValidPermission('hack.shell')).toBe(false);
    expect(isValidPermission('')).toBe(false);
  });

  it('checkPermission matches exact', () => {
    expect(checkPermission(['filesystem.read.project'], 'filesystem.read.project')).toBe(true);
    expect(checkPermission(['filesystem.read.project'], 'filesystem.write.project')).toBe(false);
  });

  it('checkPermission matches ipc.call wildcards', () => {
    expect(checkPermission(['ipc.call:git.*'], 'ipc.call:git.log')).toBe(true);
    expect(checkPermission(['ipc.call:git.*'], 'ipc.call:files.read')).toBe(false);
  });

  it('expandPermissionPattern handles wildcards', () => {
    expect(expandPermissionPattern('ipc.call:git.*', 'ipc.call:git.log')).toBe(true);
    expect(expandPermissionPattern('ipc.call:git.*', 'ipc.call:foo')).toBe(false);
  });
});
