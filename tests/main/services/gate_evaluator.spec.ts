// Plan 8 Task 12 — GateEvaluator engine-grade tests.
import { describe, test, expect } from 'vitest';
import {
  GateEvaluator,
  type FileSystemPort,
  type MetaMdStore,
  type ReviewerOutcomeStore,
  type TaskMeta,
} from '../../../src/main/services/gate_evaluator';
import type { Stage, Gate, GateItem } from '../../../src/core/domain/methodology';
import type { Task, StrictnessMode } from '../../../src/core/domain/task';

// ---------------------------------------------------------------------------
// Inline mock ports
// ---------------------------------------------------------------------------

class MockFs implements FileSystemPort {
  constructor(private readonly map: Record<string, readonly string[]> = {}) {}
  async listFilesRecursive(rootAbs: string): Promise<readonly string[]> {
    return this.map[rootAbs] ?? [];
  }
}

class MockMeta implements MetaMdStore {
  constructor(private readonly meta: TaskMeta = {}) {}
  async load(_projectPath: string, _taskId: string): Promise<TaskMeta> {
    return this.meta;
  }
}

class MockReviewers implements ReviewerOutcomeStore {
  constructor(private readonly passed: readonly string[] = []) {}
  async getPassedReviewers(_projectPath: string, _taskId: string): Promise<readonly string[]> {
    return this.passed;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    methodologyId: 'm1',
    stageId: 's1',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    totalTokens: { input: 0, output: 0 },
    ...overrides,
  };
}

function makeStage(gate?: Gate): Stage {
  return {
    id: 's1',
    name: 'Stage 1',
    mode: 'gate',
    contract: { input: [], output: { path: 'out.md' } },
    gate,
  };
}

function makeItem(overrides: Partial<GateItem> & Pick<GateItem, 'id'>): GateItem {
  return {
    label: overrides.id,
    kind: 'artifact_written',
    ...overrides,
  };
}

const PROJECT = '/p';
const TASK_ROOT = `${PROJECT}/.sherpa/tasks/t1`;

function makeEvaluator(opts: {
  files?: readonly string[];
  meta?: TaskMeta;
  passed?: readonly string[];
} = {}): GateEvaluator {
  return new GateEvaluator(
    new MockFs({ [TASK_ROOT]: opts.files ?? [] }),
    new MockMeta(opts.meta ?? {}),
    new MockReviewers(opts.passed ?? []),
  );
}

function withStrictness(mode: StrictnessMode): Task {
  return makeTask({ strictness_mode: mode });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GateEvaluator', () => {
  test('no gate → kind no_gate', async () => {
    const ev = makeEvaluator();
    const out = await ev.evaluate(makeStage(undefined), makeTask(), PROJECT);
    expect(out.kind).toBe('no_gate');
  });

  test('all items pass under autonomous + no auto_pass_when → pass', async () => {
    const ev = makeEvaluator();
    const gate: Gate = {
      kind: 'standard',
      items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('autonomous'), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') {
      expect(out.items.map((i) => i.verdict)).toEqual(['pass', 'pass']);
    }
  });

  test('auto_pass_when true via real fs signal → pass', async () => {
    const ev = makeEvaluator({ files: ['plan.md'] });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: "artifact_exists('plan.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('pass');
  });

  test('auto_pass_when false + hard_stop → block, blocking_count=1', async () => {
    const ev = makeEvaluator({ files: [] });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          hard_stop: true,
          auto_pass_when: { expr: "artifact_exists('plan.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('block');
    if (out.kind === 'block') {
      expect(out.blocking_count).toBe(1);
      expect(out.items[0]!.verdict).toBe('fail');
    }
  });

  test('auto_pass_when false, no hard_stop → ask, NOT blocking → pass', async () => {
    const ev = makeEvaluator({ files: [] });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: "artifact_exists('plan.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') {
      expect(out.items[0]!.verdict).toBe('ask');
    }
  });

  test('hard_stop + ask verdict (no auto_pass_when, standard) → block', async () => {
    const ev = makeEvaluator();
    const gate: Gate = {
      kind: 'standard',
      items: [makeItem({ id: 'a', hard_stop: true })],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('block');
    if (out.kind === 'block') {
      expect(out.blocking_count).toBe(1);
      expect(out.items[0]!.verdict).toBe('ask');
    }
  });

  test('strictness=careful asks every item even when expr true', async () => {
    const ev = makeEvaluator({ files: ['plan.md'] });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: "artifact_exists('plan.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('careful'), PROJECT);
    // not blocking — no hard_stop on the item.
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') {
      expect(out.items[0]!.verdict).toBe('ask');
    }
  });

  test('strictness=verify_only on artifact_written item without expr → pass', async () => {
    const ev = makeEvaluator();
    const gate: Gate = {
      kind: 'standard',
      items: [makeItem({ id: 'a', kind: 'artifact_written' })],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('verify_only'), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') {
      expect(out.items[0]!.verdict).toBe('pass');
    }
  });

  test('strictness=verify_only on user_confirmed → ask (and blocks if hard_stop)', async () => {
    const ev = makeEvaluator();
    const gate: Gate = {
      kind: 'standard',
      items: [makeItem({ id: 'a', kind: 'user_confirmed', hard_stop: true })],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('verify_only'), PROJECT);
    expect(out.kind).toBe('block');
    if (out.kind === 'block') {
      expect(out.items[0]!.verdict).toBe('ask');
    }
  });

  test('reviewer_passed predicate routes to ReviewerOutcomeStore', async () => {
    const ev = makeEvaluator({ passed: ['lint', 'tests'] });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          kind: 'reviewer_pass',
          auto_pass_when: { expr: "reviewer_passed('lint')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') expect(out.items[0]!.verdict).toBe('pass');
  });

  test('confidence_at_least reads MetaMdStore.confidence', async () => {
    const ev = makeEvaluator({ meta: { confidence: 'high' } });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: "confidence_at_least('high')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') expect(out.items[0]!.verdict).toBe('pass');
  });

  test('scope_unchanged is false when recut_count > 0', async () => {
    const ev = makeEvaluator({ meta: { recut_count: 2 } });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          hard_stop: true,
          auto_pass_when: { expr: 'scope_unchanged()' },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('block');
  });

  test('recut_count derivable from counters.recut_count', async () => {
    const ev = makeEvaluator({ meta: { counters: { recut_count: 3 } } });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: 'scope_unchanged()' },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    // expr false, no hard_stop → ask → not blocking
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') expect(out.items[0]!.verdict).toBe('ask');
  });

  test('meta.<field> path comparison reads MetaMdStore.fields', async () => {
    const ev = makeEvaluator({ meta: { fields: { phase: 'design' } } });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: "meta.phase == 'design'" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') expect(out.items[0]!.verdict).toBe('pass');
  });

  test('reason text is non-empty for every verdict and explains the rule', async () => {
    const ev = makeEvaluator({ files: ['plan.md'] });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({ id: 'noexpr' }),
        makeItem({
          id: 'true',
          auto_pass_when: { expr: "artifact_exists('plan.md')" },
        }),
        makeItem({
          id: 'false_hs',
          hard_stop: true,
          auto_pass_when: { expr: "artifact_exists('missing.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    if (out.kind === 'no_gate') throw new Error('expected verdicts');
    for (const v of out.items) {
      expect(v.reason).toBeTruthy();
      expect(v.reason.length).toBeGreaterThan(0);
    }
    expect(out.items.find((i) => i.id === 'true')!.reason).toMatch(/true.*pass/);
    expect(out.items.find((i) => i.id === 'false_hs')!.reason).toMatch(/false.*hard_stop.*fail/);
  });

  test('missing fs root degrades to no artifacts (no throw)', async () => {
    const fs: FileSystemPort = {
      async listFilesRecursive() {
        throw new Error('ENOENT');
      },
    };
    const ev = new GateEvaluator(fs, new MockMeta(), new MockReviewers());
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: "artifact_exists('plan.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    // artifacts=[] → expr false → ask → not blocking
    expect(out.kind).toBe('pass');
  });

  test('two failing hard_stop items → blocking_count=2', async () => {
    const ev = makeEvaluator();
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          hard_stop: true,
          auto_pass_when: { expr: "artifact_exists('x.md')" },
        }),
        makeItem({
          id: 'b',
          hard_stop: true,
          auto_pass_when: { expr: "artifact_exists('y.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('block');
    if (out.kind === 'block') {
      expect(out.blocking_count).toBe(2);
      expect(out.items.map((i) => i.verdict)).toEqual(['fail', 'fail']);
    }
  });

  test('parse error in auto_pass_when degrades to ask', async () => {
    const ev = makeEvaluator();
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: '!!! not valid !!!' },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), withStrictness('standard'), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') {
      expect(out.items[0]!.verdict).toBe('ask');
      expect(out.items[0]!.reason).toMatch(/parse error/);
    }
  });

  test('defaults strictness=standard when task.strictness_mode is unset', async () => {
    const ev = makeEvaluator({ files: ['plan.md'] });
    const gate: Gate = {
      kind: 'standard',
      items: [
        makeItem({
          id: 'a',
          auto_pass_when: { expr: "artifact_exists('plan.md')" },
        }),
      ],
    };
    const out = await ev.evaluate(makeStage(gate), makeTask(), PROJECT);
    expect(out.kind).toBe('pass');
    if (out.kind === 'pass') expect(out.items[0]!.verdict).toBe('pass');
  });
});
