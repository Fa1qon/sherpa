// tests/core/infrastructure/atomic_write.spec.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  atomicWrite,
  StorageLockedError,
  StorageFullError,
  StoragePermissionError,
} from '../../../src/core/infrastructure/atomic_write';

describe('atomicWrite', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sherpa-atomic-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('writes file content', async () => {
    const file = join(dir, 'out.json');
    await atomicWrite(file, '{"hello":"world"}');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('{"hello":"world"}');
  });

  test('overwrites existing file', async () => {
    const file = join(dir, 'out.txt');
    await atomicWrite(file, 'first');
    await atomicWrite(file, 'second');
    expect(readFileSync(file, 'utf8')).toBe('second');
  });
});

describe('Storage error classes', () => {
  test('StorageLockedError message includes holder pid when given', () => {
    const err = new StorageLockedError('/some/path', 1234);
    expect(err.message).toBe('File is locked: /some/path (held by pid=1234)');
  });

  test('StorageLockedError message omits pid clause when not given', () => {
    const err = new StorageLockedError('/some/path');
    // Critical: must NOT have a stray trailing `)` — the inlining regressed this once.
    expect(err.message).toBe('File is locked: /some/path');
  });

  test('StorageFullError has the right code', () => {
    const err = new StorageFullError('/some/path');
    expect(err.code).toBe('ENOSPC');
  });

  test('StoragePermissionError has the right code', () => {
    const err = new StoragePermissionError('/some/path', 'write');
    expect(err.code).toBe('EACCES');
  });
});
