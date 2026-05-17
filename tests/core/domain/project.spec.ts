// tests/core/domain/project.spec.ts
import { describe, test, expect } from 'vitest';
import {
  type Project,
  type RecentEntry,
  isProject,
  toRecentEntry,
} from '../../../src/core/domain/project';

describe('Project domain', () => {
  test('isProject narrows valid object', () => {
    const value: unknown = {
      id: 'abc',
      name: 'my-project',
      path: 'C:/Projects/my-project',
      addedAt: '2026-05-10T00:00:00Z',
    };
    expect(isProject(value)).toBe(true);
    if (isProject(value)) {
      expect(value.name).toBe('my-project');
    }
  });

  test('isProject rejects missing fields', () => {
    expect(isProject({ id: 'x' })).toBe(false);
    expect(isProject(null)).toBe(false);
    expect(isProject('not an object')).toBe(false);
  });

  test('toRecentEntry omits lastOpenedAt when undefined (not set to undefined)', () => {
    const p: Project = {
      id: 'abc',
      name: 'my-project',
      path: 'C:/Projects/my-project',
      addedAt: '2026-05-10T00:00:00Z',
    };
    const entry = toRecentEntry(p);
    expect('lastOpenedAt' in entry).toBe(false);
  });

  test('toRecentEntry strips runtime fields, keeps stable identity', () => {
    const p: Project = {
      id: 'abc',
      name: 'my-project',
      path: 'C:/Projects/my-project',
      addedAt: '2026-05-10T00:00:00Z',
      lastOpenedAt: '2026-05-11T12:00:00Z',
    };
    const entry: RecentEntry = toRecentEntry(p);
    expect(entry).toEqual({
      id: 'abc',
      name: 'my-project',
      path: 'C:/Projects/my-project',
      lastOpenedAt: '2026-05-11T12:00:00Z',
    });
  });
});
