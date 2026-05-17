// tests/main/services/artifact_store.spec.ts
// Plan 8 Task 15 — concrete ArtifactStore tests.
//
// Covers: simple writes (default path), directory autocreation,
// conditional_paths selection, invariants (cap/floor/set), atomic
// writes (no stray .tmp), and graceful handling of artifacts with
// no frontmatter when invariants are declared.

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ArtifactStoreImpl, type WarnLogger } from '../../../src/main/services/artifact_store';
import type { ArtifactSpec } from '../../../src/core/domain/methodology';

const TASK_ID = 'task-1';
let projectRoot: string;

class RecordingLogger implements WarnLogger {
  readonly warnings: { msg: string; meta?: Record<string, unknown> }[] = [];
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.warnings.push({ msg, meta });
  }
}

beforeEach(() => {
  projectRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'sherpa-artifact-test-'));
});

afterEach(async () => {
  try {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

function chatDir(num = 1): string {
  return path.join(
    projectRoot,
    '.sherpa',
    'tasks',
    TASK_ID,
    `chat_${String(num).padStart(2, '0')}`,
  );
}

describe('ArtifactStoreImpl — simple write', () => {
  test('writes content at chat_01/foo.md and reports the absolute path', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    const spec: ArtifactSpec = { path: 'foo.md' };
    const result = await store.writeArtifact(spec, '# hello\n', {
      projectPath: projectRoot,
      taskId: TASK_ID,
      chatNum: 1,
    });
    expect(result.path).toBe(path.join(chatDir(1), 'foo.md'));
    const written = await fsp.readFile(result.path, 'utf8');
    expect(written).toBe('# hello\n');
  });

  test('auto-creates the chat_NN directory if missing', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    const spec: ArtifactSpec = { path: 'nested/dir/foo.md' };
    const result = await store.writeArtifact(spec, 'body', {
      projectPath: projectRoot,
      taskId: TASK_ID,
      chatNum: 3,
    });
    expect(result.path).toBe(path.join(chatDir(3), 'nested', 'dir', 'foo.md'));
    const stat = await fsp.stat(result.path);
    expect(stat.isFile()).toBe(true);
  });

  test('default chatNum=1 when omitted', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    const result = await store.writeArtifact(
      { path: 'x.md' },
      'x',
      { projectPath: projectRoot, taskId: TASK_ID },
    );
    expect(result.path.includes('chat_01')).toBe(true);
  });
});

describe('ArtifactStoreImpl — conditional_paths', () => {
  test('low confidence → routes to quarantine path', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    const spec: ArtifactSpec = {
      path: 'main/finding.md',
      conditional_paths: [
        {
          when: { expr: 'artifact.confidence < 0.6' },
          path: 'quarantine/finding.md',
        },
      ],
    };
    const content = `---\nconfidence: 0.5\n---\nbody\n`;
    const result = await store.writeArtifact(spec, content, {
      projectPath: projectRoot,
      taskId: TASK_ID,
      chatNum: 1,
    });
    expect(result.path).toBe(path.join(chatDir(1), 'quarantine', 'finding.md'));
  });

  test('high confidence → falls back to default path', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    const spec: ArtifactSpec = {
      path: 'main/finding.md',
      conditional_paths: [
        {
          when: { expr: 'artifact.confidence < 0.6' },
          path: 'quarantine/finding.md',
        },
      ],
    };
    const content = `---\nconfidence: 0.7\n---\nbody\n`;
    const result = await store.writeArtifact(spec, content, {
      projectPath: projectRoot,
      taskId: TASK_ID,
      chatNum: 1,
    });
    expect(result.path).toBe(path.join(chatDir(1), 'main', 'finding.md'));
  });
});

describe('ArtifactStoreImpl — invariants', () => {
  test('cap clamps numeric field when condition matches', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    const spec: ArtifactSpec = {
      path: 'f.md',
      invariants: [
        {
          when: { expr: 'artifact.falsification_available == false' },
          enforce_field: 'confidence',
          op: 'cap',
          value: 0.6,
        },
      ],
    };
    const content = `---\nfalsification_available: false\nconfidence: 0.9\n---\nbody\n`;
    const result = await store.writeArtifact(spec, content, {
      projectPath: projectRoot,
      taskId: TASK_ID,
      chatNum: 1,
    });
    const written = await fsp.readFile(result.path, 'utf8');
    expect(written).toMatch(/confidence:\s*0\.6/);
    expect(written).not.toMatch(/confidence:\s*0\.9/);
  });

  test('cap is a no-op when condition does not fire', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    const spec: ArtifactSpec = {
      path: 'f.md',
      invariants: [
        {
          when: { expr: 'artifact.falsification_available == false' },
          enforce_field: 'confidence',
          op: 'cap',
          value: 0.6,
        },
      ],
    };
    const content = `---\nfalsification_available: true\nconfidence: 0.9\n---\nbody\n`;
    const result = await store.writeArtifact(spec, content, {
      projectPath: projectRoot,
      taskId: TASK_ID,
      chatNum: 1,
    });
    const written = await fsp.readFile(result.path, 'utf8');
    expect(written).toMatch(/confidence:\s*0\.9/);
  });

  test('invariants on content without frontmatter → warning, original body kept', async () => {
    const logger = new RecordingLogger();
    const store = new ArtifactStoreImpl({ noFsync: true, logger });
    const spec: ArtifactSpec = {
      path: 'f.md',
      invariants: [
        {
          when: { expr: 'artifact.x == 1' },
          enforce_field: 'x',
          op: 'set',
          value: 2,
        },
      ],
    };
    const result = await store.writeArtifact(spec, 'plain body, no fm', {
      projectPath: projectRoot,
      taskId: TASK_ID,
      chatNum: 1,
    });
    const written = await fsp.readFile(result.path, 'utf8');
    expect(written).toBe('plain body, no fm');
    expect(logger.warnings.some((w) => w.msg.includes('no frontmatter'))).toBe(
      true,
    );
  });
});

describe('ArtifactStoreImpl — atomicity', () => {
  test('write leaves no .tmp files behind', async () => {
    const store = new ArtifactStoreImpl({ noFsync: true });
    await store.writeArtifact(
      { path: 'a.md' },
      'a',
      { projectPath: projectRoot, taskId: TASK_ID, chatNum: 1 },
    );
    const entries = await fsp.readdir(chatDir(1));
    const tmpFiles = entries.filter((e) => e.includes('.tmp.'));
    expect(tmpFiles).toEqual([]);
    expect(entries).toContain('a.md');
  });
});
