// tests/main/integration/engine_end_to_end.spec.ts
//
// Plan 8 Task 20 — ACID GATE for Plan 8.
//
// End-to-end engine integration test. Drives the full Engine v1 slice with
// a stub AgentPort against a hard-coded Methodology IR for lite_cycle.
//
// Scope (what Plan 8 actually built — not what a future plan will wire):
//   - makeLiteCycleMethodology() directly constructs the Methodology IR
//     (5 stages, 6 edges, no composition hints, no gate items, no AI
//     directives); the prose-importer was removed in Plan 8b.
//   - MethodologyRunner walks the edge graph linearly:
//       start → clarify → plan → implement → verify → case → end
//   - StageRunner opens a stub agent session per stage, sends an initial
//     prompt, awaits turn (immediate), and short-circuits via the
//     GateEvaluator's `no_gate` path (lite_cycle has no gate items).
//   - MetaMdStore persists `meta.md` with stage_history + status='completed'.
//   - TraceLogger persists `trace.jsonl` with the canonical event sequence:
//       task_started, stage_entered×5, gate_evaluated×5, stage_completed×5,
//       edge_traversed×5 (one per outgoing edge), task_completed.
//   - ComplianceReviewer (Task 18) consumes the same IR + meta + trace
//     and writes `compliance_review.md` via the stub adapter.
//
// What this test DOES NOT cover (deferred to a future UI wiring plan):
//   - Driving the engine via the renderer / IPC. There is no
//     task-creation IPC that bootstraps MethodologyRunner yet — see
//     BUILD_LOG Plan 8 closeout entry.
//   - Real Claude Code adapter. The stub returns canned messages and
//     resolves awaitTurn() immediately; no child process is spawned.
//
// No new runtime deps; uses the same gray-matter dependency the
// MetaMdStore depends on, only for round-tripping the persisted frontmatter
// in assertions.

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';

import type { Methodology } from '../../../src/core/domain/methodology';
import { MethodologyRunner } from '../../../src/main/services/methodology_runner';
import { StageRunner } from '../../../src/main/services/stage_runner';
import {
  GateEvaluator,
  type FileSystemPort,
  type ReviewerOutcomeStore,
} from '../../../src/main/services/gate_evaluator';
import { MetaMdStoreImpl } from '../../../src/main/services/meta_md_store';
import { SystemPromptAssembler } from '../../../src/main/services/system_prompt_assembler';
import { createTraceLogger, readTrace } from '../../../src/main/services/trace_logger';
import {
  ComplianceReviewer,
  complianceReportPath,
} from '../../../src/main/services/compliance_reviewer';
import {
  StubAgentAdapter,
  isStubAdapterEnabled,
} from '../../../src/main/adapters/stub_agent_adapter';
import type { Task } from '../../../src/core/domain/task';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Hard-coded lite_cycle Methodology IR. The prose-importer was removed in
// Plan 8b; this helper directly constructs the IR that the fixture defined.
function makeLiteCycleMethodology(): Methodology {
  const stageIds = ['clarify', 'plan', 'implement', 'verify', 'case'] as const;
  const always = { kind: 'always' } as const;
  return {
    id: 'lite_cycle',
    name: 'Lite Cycle',
    description: 'Lightweight cycle for small features.',
    version: '1.0.0',
    stages: stageIds.map((id): import('../../../src/core/domain/methodology').Stage => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      mode: 'auto',
      contract: { input: [], output: { path: `${id}.md` } },
    })),
    edges: [
      { from: 'start', to: 'clarify', condition: always },
      { from: 'clarify', to: 'plan', condition: always },
      { from: 'plan', to: 'implement', condition: always },
      { from: 'implement', to: 'verify', condition: always },
      { from: 'verify', to: 'case', condition: always },
      { from: 'case', to: 'end', condition: always },
    ],
  };
}

/** Recursive-list FilesystemPort — minimal real adapter for the test. */
const fsPort: FileSystemPort = {
  async listFilesRecursive(rootAbs: string): Promise<readonly string[]> {
    const out: string[] = [];
    async function walk(dir: string, rel: string): Promise<void> {
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const child = path.join(dir, e.name);
        const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
        if (e.isDirectory()) await walk(child, childRel);
        else if (e.isFile()) out.push(childRel);
      }
    }
    await walk(rootAbs, '');
    return out;
  },
};

const noReviewers: ReviewerOutcomeStore = {
  async getPassedReviewers() {
    return [];
  },
};

// ---------------------------------------------------------------------------
// Fixture scaffolding
// ---------------------------------------------------------------------------

let projectRoot: string;
const TASK_ID = 'plan8-acid-task';

beforeEach(() => {
  projectRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'sherpa-plan8-e2e-'));
});

afterEach(async () => {
  try {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Plan 8 ACID — engine end-to-end against lite_cycle', () => {
  test('isStubAdapterEnabled toggles on SHERPA_STUB_ADAPTER=1', () => {
    expect(isStubAdapterEnabled({})).toBe(false);
    expect(isStubAdapterEnabled({ SHERPA_STUB_ADAPTER: '1' })).toBe(true);
    expect(isStubAdapterEnabled({ SHERPA_STUB_ADAPTER: 'true' })).toBe(true);
    expect(isStubAdapterEnabled({ SHERPA_STUB_ADAPTER: '0' })).toBe(false);
  });

  test('makeLiteCycleMethodology produces the expected IR shape', () => {
    const result = makeLiteCycleMethodology();

    expect(result.id).toBe('lite_cycle');
    expect(result.stages.length).toBe(5);
    expect(result.stages.map((s) => s.id)).toEqual([
      'clarify',
      'plan',
      'implement',
      'verify',
      'case',
    ]);
    // Edges form a linear chain plus the start/end sentinels.
    expect(result.edges.length).toBe(6);
    expect(result.edges[0]?.from).toBe('start');
    expect(result.edges[result.edges.length - 1]?.to).toBe('end');
  });

  test(
    'MethodologyRunner drives lite_cycle to completion with stub adapter',
    async () => {
      // -- Build IR ----------------------------------------------------------
      const methodology = makeLiteCycleMethodology();

      // -- Wire engine -----------------------------------------------------
      const stub = new StubAgentAdapter();
      const assembler = new SystemPromptAssembler();
      const metaStore = new MetaMdStoreImpl({ noFsync: true });
      const evaluator = new GateEvaluator(fsPort, metaStore, noReviewers);
      const traceLogger = createTraceLogger(projectRoot, TASK_ID);
      const stageRunner = new StageRunner(
        assembler,
        stub,
        evaluator,
        traceLogger,
        metaStore,
        { writeArtifact: async () => undefined },
      );
      const runner = new MethodologyRunner(stageRunner, metaStore, traceLogger);

      // -- Task descriptor -------------------------------------------------
      const task: Task = {
        id: TASK_ID,
        methodologyId: methodology.id,
        stageId: 'clarify',
        status: 'running',
        thread: [],
        config: { autonomy: 'auto', urgency: 'normal', importance: 'normal' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalTokens: { input: 0, output: 0 },
        strictness_mode: 'autonomous',
      };

      // -- Run -------------------------------------------------------------
      const result = await runner.run(methodology, task, projectRoot);

      // -- Verdict ---------------------------------------------------------
      expect(result.kind).toBe('completed');
      // One agent session per stage (5).
      expect(stub.sessionsOpened).toBe(5);
      expect(stub.sessionsClosed).toBe(5);

      // -- meta.md persisted ----------------------------------------------
      const metaFile = path.join(
        projectRoot,
        '.sherpa',
        'tasks',
        TASK_ID,
        'meta.md',
      );
      const metaRaw = await fsp.readFile(metaFile, 'utf8');
      expect(metaRaw).toMatch(/^---\s*\n/);
      const front = matter(metaRaw).data as Record<string, unknown>;
      // current_stage is the sentinel 'end' once the runner exits the loop.
      expect(front['current_stage']).toBe('end');
      const history = front['stage_history'] as Array<{ stage_id: string }>;
      const stageIds = history.map((h) => h.stage_id);
      // History contains an entry per stage entered, plus the terminal 'end'
      // entry the runner appends when setCurrentStage('end') fires.
      expect(stageIds).toContain('clarify');
      expect(stageIds).toContain('plan');
      expect(stageIds).toContain('implement');
      expect(stageIds).toContain('verify');
      expect(stageIds).toContain('case');

      // -- trace.jsonl persisted ------------------------------------------
      const tracePath = path.join(
        projectRoot,
        '.sherpa',
        'tasks',
        TASK_ID,
        'trace.jsonl',
      );
      const trace = await readTrace(tracePath);
      const kinds = trace.map((e) => e.kind);
      expect(kinds).toContain('task_started');
      expect(kinds).toContain('task_completed');
      // One stage_entered per stage.
      const enteredCount = kinds.filter((k) => k === 'stage_entered').length;
      expect(enteredCount).toBe(5);
      // One gate_evaluated per stage (engine evaluates even when stage has no gate).
      const gateCount = kinds.filter((k) => k === 'gate_evaluated').length;
      expect(gateCount).toBe(5);
      // Edge traversals: 5 forward edges in the lite_cycle linear chain.
      const edgeCount = kinds.filter((k) => k === 'edge_traversed').length;
      expect(edgeCount).toBe(5);
    },
    20_000,
  );

  test('ComplianceReviewer writes a verdict report against the completed task', async () => {
    // -- Drive the engine first (re-uses the same setup) ------------------
    const methodology = makeLiteCycleMethodology();
    const stub = new StubAgentAdapter({
      cannedReply:
        '# Compliance Review\n\nVerdict: COMPLIANT\n\nAll 5 stages traversed in order. No anomalies.',
    });
    const assembler = new SystemPromptAssembler();
    const metaStore = new MetaMdStoreImpl({ noFsync: true });
    const evaluator = new GateEvaluator(fsPort, metaStore, noReviewers);
    const traceLogger = createTraceLogger(projectRoot, TASK_ID);
    const stageRunner = new StageRunner(
      assembler,
      stub,
      evaluator,
      traceLogger,
      metaStore,
      { writeArtifact: async () => undefined },
    );
    const runner = new MethodologyRunner(stageRunner, metaStore, traceLogger);
    const task: Task = {
      id: TASK_ID,
      methodologyId: methodology.id,
      stageId: 'clarify',
      status: 'running',
      thread: [],
      config: { autonomy: 'auto', urgency: 'normal', importance: 'normal' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalTokens: { input: 0, output: 0 },
      strictness_mode: 'autonomous',
    };
    await runner.run(methodology, task, projectRoot);

    // -- Run the reviewer -------------------------------------------------
    const reviewer = new ComplianceReviewer(stub, { noFsync: true });
    const meta = await metaStore.load(projectRoot, TASK_ID);
    const tracePath = path.join(
      projectRoot,
      '.sherpa',
      'tasks',
      TASK_ID,
      'trace.jsonl',
    );
    const trace = await readTrace(tracePath);
    const review = await reviewer.review({
      projectPath: projectRoot,
      taskId: TASK_ID,
      methodology,
      meta,
      trace,
      artifacts: {},
    });

    // -- Assert report on disk -------------------------------------------
    const expectedPath = complianceReportPath(projectRoot, TASK_ID);
    expect(review.path).toBe(expectedPath);
    const reportRaw = await fsp.readFile(expectedPath, 'utf8');
    expect(reportRaw).toMatch(/COMPLIANT/);
    // Verify the reviewer used a separate session distinct from the
    // 5 engine sessions above (so sessionsOpened is now 6).
    expect(stub.sessionsOpened).toBe(6);
  }, 20_000);
});
