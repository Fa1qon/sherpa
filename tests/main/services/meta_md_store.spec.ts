// tests/main/services/meta_md_store.spec.ts
// Plan 8 Task 15 — concrete MetaMdStore tests.
//
// Covers: load defaults, round-trip serialization, counter mutations,
// stage completion / rollback recording, status flips, atomic writes
// (no stray .tmp files), and tolerance of missing / malformed input.

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MetaMdStoreImpl } from '../../../src/main/services/meta_md_store';

const TASK_ID = 'task-1';

let projectRoot: string;
let clockTick: number;

function makeClock() {
  return () => `2026-05-12T00:00:${String(clockTick++).padStart(2, '0')}.000Z`;
}

beforeEach(() => {
  projectRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'sherpa-meta-test-'));
  clockTick = 0;
});

afterEach(async () => {
  try {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

function metaPath(): string {
  return path.join(projectRoot, '.sherpa', 'tasks', TASK_ID, 'meta.md');
}

describe('MetaMdStoreImpl — load defaults', () => {
  test('load() on non-existent file returns defaults without throwing', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    const meta = await store.load(projectRoot, TASK_ID);
    expect(meta.status).toBe('active');
    expect(meta.counters).toEqual({});
    expect(meta.stage_history).toEqual([]);
    expect(meta.task_id).toBe(TASK_ID);
    expect(typeof meta.started_at).toBe('string');
  });

  test('load() on malformed YAML returns defaults', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    await fsp.mkdir(path.dirname(metaPath()), { recursive: true });
    // Frontmatter delimiters with invalid YAML inside
    await fsp.writeFile(metaPath(), '---\n: : nope\nkey:  :: -\n---\nbody');
    const meta = await store.load(projectRoot, TASK_ID);
    // gray-matter is forgiving; either it returns {} or we fall back to defaults.
    expect(meta.task_id).toBe(TASK_ID);
  });
});

describe('MetaMdStoreImpl — save / round-trip', () => {
  test('save then load preserves all fields exactly', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    const original = {
      task_id: TASK_ID,
      methodology_id: 'm1',
      methodology_version: '1.0.0',
      strictness_mode: 'standard' as const,
      complexity: 'C2' as const,
      current_stage: 's1',
      status: 'active' as const,
      started_at: '2026-05-12T00:00:00.000Z',
      counters: { recut_count: 2, flag_a: true },
      stage_history: [
        { stage_id: 's1', entered_at: '2026-05-12T00:00:01.000Z' },
      ],
    };
    await store.save(projectRoot, TASK_ID, original);
    const loaded = await store.load(projectRoot, TASK_ID);
    expect(loaded.methodology_id).toBe('m1');
    expect(loaded.methodology_version).toBe('1.0.0');
    expect(loaded.strictness_mode).toBe('standard');
    expect(loaded.complexity).toBe('C2');
    expect(loaded.current_stage).toBe('s1');
    expect(loaded.counters).toEqual({ recut_count: 2, flag_a: true });
    expect(loaded.stage_history).toHaveLength(1);
    expect(loaded.stage_history?.[0]?.stage_id).toBe('s1');
  });
});

describe('MetaMdStoreImpl — mutators', () => {
  test('applyCounterMutations increments counters (initializing to 1)', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    await store.applyCounterMutations(projectRoot, TASK_ID, {
      incremented: ['recut_count', 'recut_count', 'other'],
      preserved: [],
    });
    // Three calls, sequenced reads — but we passed three names in one
    // call. Each name increments once per appearance, so 'recut_count'
    // ends at 2 and 'other' at 1.
    const meta = await store.load(projectRoot, TASK_ID);
    expect(meta.counters?.['recut_count']).toBe(2);
    expect(meta.counters?.['other']).toBe(1);
  });

  test('markStageCompleted appends a history entry with completed_at', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    await store.markStageCompleted(projectRoot, TASK_ID, 's1');
    const meta = await store.load(projectRoot, TASK_ID);
    expect(meta.stage_history).toHaveLength(1);
    expect(meta.stage_history?.[0]?.stage_id).toBe('s1');
    expect(meta.stage_history?.[0]?.completed_at).toBeDefined();
  });

  test('setCurrentStage then markStageCompleted closes the open entry', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    await store.setCurrentStage(projectRoot, TASK_ID, 's1');
    await store.markStageCompleted(projectRoot, TASK_ID, 's1');
    const meta = await store.load(projectRoot, TASK_ID);
    expect(meta.current_stage).toBe('s1');
    // Exactly one entry — the open one from setCurrentStage got closed,
    // not duplicated by markStageCompleted.
    expect(meta.stage_history).toHaveLength(1);
    expect(meta.stage_history?.[0]?.completed_at).toBeDefined();
  });

  test('recordRollback creates a new entry with rollback_from', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    await store.setCurrentStage(projectRoot, TASK_ID, 's3');
    await store.recordRollback(projectRoot, TASK_ID, 's3', 's1');
    const meta = await store.load(projectRoot, TASK_ID);
    expect(meta.current_stage).toBe('s1');
    const last = meta.stage_history?.[meta.stage_history.length - 1];
    expect(last?.stage_id).toBe('s1');
    expect(last?.rollback_from).toBe('s3');
  });

  test('setStatus("paused") then setStatus("active") flips status without breaking history', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    await store.setCurrentStage(projectRoot, TASK_ID, 's1');
    await store.setStatus(projectRoot, TASK_ID, 'paused');
    let meta = await store.load(projectRoot, TASK_ID);
    expect(meta.status).toBe('paused');
    expect(meta.current_stage).toBe('s1');
    await store.setStatus(projectRoot, TASK_ID, 'active');
    meta = await store.load(projectRoot, TASK_ID);
    expect(meta.status).toBe('active');
    // Resume preserves the cursor — critical for MethodologyRunner resume logic.
    expect(meta.current_stage).toBe('s1');
  });
});

describe('MetaMdStoreImpl — atomicity', () => {
  test('two consecutive writes leave exactly one final meta.md and zero .tmp files', async () => {
    const store = new MetaMdStoreImpl({ clock: makeClock(), noFsync: true });
    await store.setCurrentStage(projectRoot, TASK_ID, 's1');
    await store.setCurrentStage(projectRoot, TASK_ID, 's2');

    const dir = path.dirname(metaPath());
    const entries = await fsp.readdir(dir);
    const tmpFiles = entries.filter((e) => e.includes('.tmp.'));
    const finalFiles = entries.filter((e) => e === 'meta.md');
    expect(tmpFiles).toEqual([]);
    expect(finalFiles).toEqual(['meta.md']);
  });
});
