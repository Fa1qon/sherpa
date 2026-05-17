// tests/main/services/files_service.spec.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FilesService } from '../../../src/main/services/files_service';

let projectRoot: string;
let service: FilesService;

beforeEach(async () => {
  // Create an isolated temp project directory for each test.
  projectRoot = path.join(os.tmpdir(), `files_service_test_${randomUUID()}`);
  await fsp.mkdir(projectRoot, { recursive: true });

  // Scaffold a small tree:
  //   <root>/file.txt
  //   <root>/src/foo.ts
  await fsp.writeFile(path.join(projectRoot, 'file.txt'), 'hello world', 'utf8');
  await fsp.mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await fsp.writeFile(path.join(projectRoot, 'src', 'foo.ts'), 'export {}', 'utf8');

  service = new FilesService();
});

afterEach(async () => {
  await fsp.rm(projectRoot, { recursive: true, force: true });
});

describe('FilesService', () => {
  // 1. readDir(project, '') returns root-level entries
  test("readDir with empty relPath returns project root entries", async () => {
    const entries = await service.readDir(projectRoot, '');
    const names = entries.map((e) => e.name).sort();
    expect(names).toContain('file.txt');
    expect(names).toContain('src');
  });

  // 2. readDir(project, 'src') returns entries inside src
  test("readDir('src') returns entries inside src", async () => {
    const entries = await service.readDir(projectRoot, 'src');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('foo.ts');
    expect(entries[0]!.kind).toBe('file');
  });

  // 3. readDir with escape path '../outside' rejects
  test("readDir('../outside') rejects with 'escapes project root'", async () => {
    await expect(service.readDir(projectRoot, '../outside')).rejects.toThrow(
      'escapes project root',
    );
  });

  // 4. readDir with '..' rejects
  test("readDir('..') rejects with 'escapes project root'", async () => {
    await expect(service.readDir(projectRoot, '..')).rejects.toThrow(
      'escapes project root',
    );
  });

  // 5. readDir with 'sub/../inside' resolves safely (stays inside root)
  test("readDir('sub/../') resolves to inside root without rejecting", async () => {
    // 'src/../' resolves to projectRoot — that's root itself, which is allowed.
    const entries = await service.readDir(projectRoot, 'src/..');
    const names = entries.map((e) => e.name).sort();
    expect(names).toContain('file.txt');
    expect(names).toContain('src');
  });

  // 6. readFile with escape path rejects
  test("readFile('../etc/passwd') rejects with 'escapes project root'", async () => {
    await expect(service.readFile(projectRoot, '../etc/passwd')).rejects.toThrow(
      'escapes project root',
    );
  });

  // 7. readFile with valid path returns content
  test("readFile('file.txt') returns file contents", async () => {
    const content = await service.readFile(projectRoot, 'file.txt');
    expect(content).toBe('hello world');
  });

  // 8. returned relPath uses POSIX '/' separator
  test("DirEntry.relPath uses POSIX '/' separator regardless of OS", async () => {
    const entries = await service.readDir(projectRoot, 'src');
    for (const entry of entries) {
      expect(entry.relPath).not.toContain('\\');
    }
    // 'src/foo.ts' — forward slash
    expect(entries[0]!.relPath).toBe('src/foo.ts');
  });

  // Additional: readDir with empty relPath produces entries with correct relPath (no leading slash)
  test("readDir('') entries have relPath without leading slash", async () => {
    const entries = await service.readDir(projectRoot, '');
    for (const entry of entries) {
      expect(entry.relPath).not.toMatch(/^\//);
      expect(entry.relPath).not.toContain('\\');
    }
  });

  // Additional: kind is set correctly
  test("readDir returns correct kind for files and directories", async () => {
    const entries = await service.readDir(projectRoot, '');
    const fileEntry = entries.find((e) => e.name === 'file.txt');
    const dirEntry = entries.find((e) => e.name === 'src');
    expect(fileEntry?.kind).toBe('file');
    expect(dirEntry?.kind).toBe('directory');
  });
});
