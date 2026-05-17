import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { ProjectService } from '../../../src/main/services/project_service';

describe('ProjectService', () => {
  let userHome: string;
  let svc: ProjectService;

  beforeEach(() => {
    userHome = mkdtempSync(join(tmpdir(), 'sherpa-test-home-'));
    svc = new ProjectService({ userHome });
  });

  afterEach(() => {
    rmSync(userHome, { recursive: true, force: true });
  });

  test('listRecent is empty initially', async () => {
    expect(await svc.listRecent()).toEqual([]);
  });

  test('addProject fails if path does not exist', async () => {
    const result = await svc.addProject({ path: '/totally/missing/path/123' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('path-not-found');
    }
  });

  test('addProject fails if path is a file, not a directory', async () => {
    const filePath = join(userHome, 'a-file.txt');
    writeFileSync(filePath, 'hi');
    const result = await svc.addProject({ path: filePath });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-a-directory');
    }
  });

  test('addProject without scaffold + missing .sherpa returns sherpa-missing error', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-proj-'));
    try {
      const result = await svc.addProject({ path: projectPath });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('sherpa-missing-and-no-scaffold');
      }
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test('addProject with scaffold creates .sherpa/ skeleton', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-proj-'));
    try {
      const result = await svc.addProject({ path: projectPath, scaffold: true });
      expect(result.ok).toBe(true);
      expect(existsSync(join(projectPath, '.sherpa'))).toBe(true);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test('addProject succeeds when .sherpa/ already exists', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-proj-'));
    mkdirSync(join(projectPath, '.sherpa'));
    try {
      const result = await svc.addProject({ path: projectPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.project.path).toBe(projectPath);
        expect(result.project.name).toBe(basename(projectPath));
      }
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test('addProject is idempotent on path (same path returns existing id)', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-proj-'));
    mkdirSync(join(projectPath, '.sherpa'));
    try {
      const r1 = await svc.addProject({ path: projectPath });
      expect(r1.ok).toBe(true);
      const r2 = await svc.addProject({ path: projectPath });
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r2.project.id).toBe(r1.project.id);
      }
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test('open updates lastOpenedAt and returns the project', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-proj-'));
    mkdirSync(join(projectPath, '.sherpa'));
    try {
      const r = await svc.addProject({ path: projectPath });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const opened = await svc.open(r.project.id);
      expect(opened).not.toBeNull();
      expect(opened!.lastOpenedAt).toBeDefined();
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test('open returns null for unknown id', async () => {
    expect(await svc.open('nonexistent-id')).toBeNull();
  });

  test('listRecent is sorted by lastOpenedAt desc', async () => {
    const p1 = mkdtempSync(join(tmpdir(), 'sherpa-proj-1-'));
    const p2 = mkdtempSync(join(tmpdir(), 'sherpa-proj-2-'));
    mkdirSync(join(p1, '.sherpa'));
    mkdirSync(join(p2, '.sherpa'));
    try {
      const r1 = await svc.addProject({ path: p1 });
      const r2 = await svc.addProject({ path: p2 });
      if (!r1.ok || !r2.ok) return;
      // Open p1 last so it should be first in recent list
      await svc.open(r2.project.id);
      await new Promise((r) => setTimeout(r, 5));
      await svc.open(r1.project.id);
      const recent = await svc.listRecent();
      expect(recent[0]!.id).toBe(r1.project.id);
      expect(recent[1]!.id).toBe(r2.project.id);
    } finally {
      rmSync(p1, { recursive: true, force: true });
      rmSync(p2, { recursive: true, force: true });
    }
  });

  test('removeFromRecent strips the entry', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-proj-'));
    mkdirSync(join(projectPath, '.sherpa'));
    try {
      const r = await svc.addProject({ path: projectPath });
      if (!r.ok) return;
      expect(await svc.removeFromRecent(r.project.id)).toBe(true);
      expect(await svc.listRecent()).toEqual([]);
      expect(await svc.removeFromRecent(r.project.id)).toBe(false);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  test('recent persists across service instances', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'sherpa-proj-'));
    mkdirSync(join(projectPath, '.sherpa'));
    try {
      const r = await svc.addProject({ path: projectPath });
      if (!r.ok) return;
      const svc2 = new ProjectService({ userHome });
      const recent = await svc2.listRecent();
      expect(recent).toHaveLength(1);
      expect(recent[0]!.id).toBe(r.project.id);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });
});
