import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MethodologyService } from '../../../src/main/services/methodology_service';

const SAMPLE_MD = `---
id: lite
version: 1.0.0
name: Lite Cycle
description: A short cycle.
---

## Stage: req
mode: interactive

Collect.

## Stage: impl
mode: auto

Implement.
`;

describe('MethodologyService', () => {
  let projectPath: string;
  let svc: MethodologyService;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'sherpa-meth-'));
    mkdirSync(join(projectPath, '.sherpa', 'core', 'methodologies'), { recursive: true });
    svc = new MethodologyService();
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  test('list returns empty array when folder has no methodologies', async () => {
    expect(await svc.list(projectPath)).toEqual([]);
  });

  test('list returns summary for each .md file', async () => {
    writeFileSync(join(projectPath, '.sherpa/core/methodologies', 'lite.md'), SAMPLE_MD);
    const list = await svc.list(projectPath);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('lite');
    expect(list[0]!.name).toBe('Lite Cycle');
  });

  test('load returns full IR with edges', async () => {
    writeFileSync(join(projectPath, '.sherpa/core/methodologies', 'lite.md'), SAMPLE_MD);
    const r = await svc.load(projectPath, 'lite');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methodology.stages).toHaveLength(2);
    expect(r.methodology.edges.length).toBeGreaterThan(0);
  });

  test('load returns not-found for unknown id', async () => {
    const r = await svc.load(projectPath, 'nonexistent');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('not-found');
  });

  test('save round-trips a methodology', async () => {
    writeFileSync(join(projectPath, '.sherpa/core/methodologies', 'lite.md'), SAMPLE_MD);
    const r = await svc.load(projectPath, 'lite');
    if (!r.ok) return;
    await svc.save(projectPath, r.methodology);
    const r2 = await svc.load(projectPath, 'lite');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.methodology.stages).toHaveLength(r.methodology.stages.length);
  });
});
