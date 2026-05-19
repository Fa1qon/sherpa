import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TransformHandler } from '../../../src/main/plugins/handlers/transform_handler';
import type { PipelinePlugin } from '../../../src/core/domain/pipeline_plugin';
import type { PluginExecutionContext } from '../../../src/core/domain/plugin_context';

function makeCtx(workdir: string, artifactPath?: string): PluginExecutionContext {
  return {
    hook: 'on_artifact_created',
    task: { id: 't1', workdir },
    artifact: artifactPath ? { path: artifactPath, size: 0 } : undefined,
    event: {},
    timestamp: 0,
  };
}

function plugin(params: Record<string, unknown>): PipelinePlugin {
  return { id: 'p1', type: 'transform', hook: 'on_artifact_created', params };
}

describe('TransformHandler', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sherpa-transform-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('missing operation → error', async () => {
    const h = new TransformHandler();
    const r = await h.execute(plugin({}), makeCtx(dir));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('operation required');
  });

  test('copy: source → dest', async () => {
    writeFileSync(join(dir, 'src.txt'), 'hello');
    const h = new TransformHandler();
    const r = await h.execute(
      plugin({ operation: 'copy', source: 'src.txt', dest: 'out/dst.txt' }),
      makeCtx(dir),
    );
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, 'out/dst.txt'))).toBe(true);
    expect(existsSync(join(dir, 'src.txt'))).toBe(true);
  });

  test('rename: source → dest', async () => {
    writeFileSync(join(dir, 'src.txt'), 'hello');
    const h = new TransformHandler();
    const r = await h.execute(
      plugin({ operation: 'rename', source: 'src.txt', dest: 'renamed.txt' }),
      makeCtx(dir),
    );
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, 'src.txt'))).toBe(false);
    expect(existsSync(join(dir, 'renamed.txt'))).toBe(true);
  });

  test('validate-exists: ok when file present', async () => {
    writeFileSync(join(dir, 'x.txt'), 'hi');
    const h = new TransformHandler();
    const r = await h.execute(
      plugin({ operation: 'validate-exists', source: 'x.txt' }),
      makeCtx(dir),
    );
    expect(r.ok).toBe(true);
  });

  test('validate-exists: fails when file missing', async () => {
    const h = new TransformHandler();
    const r = await h.execute(
      plugin({ operation: 'validate-exists', source: 'nope.txt' }),
      makeCtx(dir),
    );
    expect(r.ok).toBe(false);
  });

  test('validate-size: ok when under maxBytes', async () => {
    writeFileSync(join(dir, 'small.txt'), 'tiny');
    const h = new TransformHandler();
    const r = await h.execute(
      plugin({ operation: 'validate-size', source: 'small.txt', maxBytes: 100 }),
      makeCtx(dir),
    );
    expect(r.ok).toBe(true);
    expect((r.output as { size: number }).size).toBe(4);
  });

  test('validate-size: fails when over maxBytes', async () => {
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(50));
    const h = new TransformHandler();
    const r = await h.execute(
      plugin({ operation: 'validate-size', source: 'big.txt', maxBytes: 10 }),
      makeCtx(dir),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain('exceeds maxBytes');
  });

  test('uses ctx.artifact.path when no explicit source', async () => {
    const artifactPath = join(dir, 'art.md');
    writeFileSync(artifactPath, '# hi');
    const h = new TransformHandler();
    const r = await h.execute(
      plugin({ operation: 'validate-exists' }),
      makeCtx(dir, artifactPath),
    );
    expect(r.ok).toBe(true);
  });
});
