// tests/main/services/compliance_reviewer.spec.ts
// Plan 8 Task 18 — methodology compliance reviewer.
//
// The reviewer is driven by an AgentPort that we stub to return a canned
// agent response. The tests verify:
//   - the prompt sent to the agent contains the methodology id, meta status
//     and the right trace event count (and embeds skipped-gate events when
//     present);
//   - the returned content is written verbatim to compliance_review.md;
//   - the write is atomic (no stray .tmp.* files survive on success);
//   - missing-artifacts and empty-trace cases do not throw.
//
// No filesystem isolation tricks beyond a tmp dir under os.tmpdir().
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ComplianceReviewer,
  buildCompliancePrompt,
  complianceReportPath,
  type TraceEventLike,
} from '../../../src/main/services/compliance_reviewer';
import type { AgentPort, AgentSession } from '../../../src/core/ports/agent_port';
import type {
  AgentMessage,
  AgentSessionConfig,
} from '../../../src/core/domain/agent';
import type { Methodology } from '../../../src/core/domain/methodology';
import type { TaskMeta } from '../../../src/core/domain/task_meta';

// ---------- Fixtures --------------------------------------------------------

function makeMethodology(): Methodology {
  return {
    id: 'demo-meth',
    version: '1.0.0',
    name: 'Demo',
    description: 'test',
    stages: [
      {
        id: 'plan',
        name: 'Plan',
        mode: 'auto',
        contract: { input: [], output: { path: 'plan.md' } },
        prompt: 'Plan it.',
      },
      {
        id: 'gate1',
        name: 'Gate',
        mode: 'gate',
        contract: { input: [], output: { path: 'gate.md' } },
        prompt: 'Check.',
      },
    ],
    edges: [
      { from: 'plan', to: 'gate1', condition: { kind: 'always' } },
    ],
  };
}

function makeMeta(): TaskMeta {
  return {
    task_id: 't1',
    methodology_id: 'demo-meth',
    status: 'completed',
    started_at: '2026-05-12T00:00:00Z',
    completed_at: '2026-05-12T00:01:00Z',
    counters: { recut_count: 0 },
    stage_history: [
      { stage_id: 'plan', entered_at: '2026-05-12T00:00:01Z', completed_at: '2026-05-12T00:00:30Z' },
    ],
  };
}

// ---------- Stub AgentPort --------------------------------------------------

interface StubOpts {
  /** Text the stub agent emits as its single agent-role message. */
  readonly cannedReply: string;
  /** Optional second message to verify multi-message accumulation. */
  readonly extraReply?: string;
  /** If set, throw inside startSession to test error surface. */
  readonly throwOnStart?: Error;
}

interface StubCapture {
  readonly port: AgentPort;
  readonly startedConfigs: AgentSessionConfig[];
  readonly sentPrompts: string[];
  readonly closed: { count: number };
}

function makeStubPort(opts: StubOpts): StubCapture {
  const startedConfigs: AgentSessionConfig[] = [];
  const sentPrompts: string[] = [];
  const closed = { count: 0 };
  const port: AgentPort = {
    providerId: 'stub',
    async health() {
      return { ok: true };
    },
    async startSession(config) {
      if (opts.throwOnStart) throw opts.throwOnStart;
      startedConfigs.push(config);
      const listeners = new Set<(m: AgentMessage) => void>();
      const session: AgentSession = {
        id: { value: 's1' },
        onMessage(cb) {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        async send(text) {
          sentPrompts.push(text);
          // Emit the canned agent message, plus an interleaved tool message
          // (which should be ignored by the reviewer's capture).
          const tool: AgentMessage = {
            id: 't',
            role: 'tool',
            text: 'tool-output-should-not-be-captured',
            timestamp: '2026-05-12T00:00:00Z',
          };
          for (const l of listeners) l(tool);
          const m: AgentMessage = {
            id: 'a',
            role: 'agent',
            text: opts.cannedReply,
            timestamp: '2026-05-12T00:00:01Z',
          };
          for (const l of listeners) l(m);
          if (opts.extraReply !== undefined) {
            const m2: AgentMessage = {
              id: 'a2',
              role: 'agent',
              text: opts.extraReply,
              timestamp: '2026-05-12T00:00:02Z',
            };
            for (const l of listeners) l(m2);
          }
        },
        async awaitTurn() {},
        async close() {
          closed.count++;
        },
      };
      return session;
    },
  };
  return { port, startedConfigs, sentPrompts, closed };
}

// ---------- Tmp project -----------------------------------------------------

let projectRoot: string;
const TASK_ID = 't1';

beforeEach(() => {
  projectRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), 'sherpa-compliance-test-'));
});

afterEach(async () => {
  try {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ---------- Tests -----------------------------------------------------------

describe('buildCompliancePrompt', () => {
  test('embeds methodology id, version, meta status and trace count', () => {
    const trace: TraceEventLike[] = [
      { kind: 'task_started', methodologyId: 'demo-meth', taskId: 't1', ts: '2026-05-12T00:00:00Z' },
      { kind: 'stage_entered', stageId: 'plan', ts: '2026-05-12T00:00:01Z' },
      { kind: 'task_completed', ts: '2026-05-12T00:01:00Z' },
    ];
    const prompt = buildCompliancePrompt({
      projectPath: '/tmp/proj',
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace,
      artifacts: {},
    });
    expect(prompt).toContain('demo-meth');
    expect(prompt).toContain('version 1.0.0');
    expect(prompt).toContain('Meta status: completed');
    expect(prompt).toContain('Trace events: 3');
    expect(prompt).toContain('## Trace events (NDJSON)');
    // Each event should appear verbatim as JSON (NDJSON block).
    expect(prompt).toContain('"kind":"task_started"');
    expect(prompt).toContain('"kind":"stage_entered"');
    // Empty artifacts block has a placeholder.
    expect(prompt).toContain('_No artifacts captured._');
  });

  test('surfaces skipped-gate anomaly via preflight_failed trace events', () => {
    // Scenario: agent skipped a gate. The trace shows preflight_failed but no
    // rollback edge_traversed. The prompt should include the failure events so
    // the reviewer can quote them in its verdict.
    const trace: TraceEventLike[] = [
      { kind: 'stage_entered', stageId: 'plan', ts: '2026-05-12T00:00:01Z' },
      { kind: 'stage_entered', stageId: 'gate1', ts: '2026-05-12T00:00:02Z' },
      { kind: 'preflight_failed', stageId: 'gate1', checkId: 'artifact_written', ts: '2026-05-12T00:00:03Z' },
      // NO rollback edge — agent moved on. This is the anomaly.
      { kind: 'edge_traversed', from: 'gate1', to: 'end', condition: 'always', ts: '2026-05-12T00:00:04Z' },
      { kind: 'task_completed', ts: '2026-05-12T00:00:05Z' },
    ];
    const prompt = buildCompliancePrompt({
      projectPath: '/tmp/proj',
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace,
      artifacts: {},
    });
    expect(prompt).toContain('"kind":"preflight_failed"');
    expect(prompt).toContain('"checkId":"artifact_written"');
    expect(prompt).toContain('"kind":"edge_traversed"');
    // Headline checklist mentions gate violations.
    expect(prompt).toContain('Gate violations');
  });

  test('includes artifact bodies under their file names', () => {
    const prompt = buildCompliancePrompt({
      projectPath: '/tmp/proj',
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace: [],
      artifacts: {
        'plan.md': '# Plan\n\nDo a thing.',
        'gate.md': '# Gate\n\nApproved.',
      },
    });
    expect(prompt).toContain('### Artifact: plan.md');
    expect(prompt).toContain('Do a thing.');
    expect(prompt).toContain('### Artifact: gate.md');
    expect(prompt).toContain('Approved.');
  });
});

describe('ComplianceReviewer.review()', () => {
  test('writes the agent reply verbatim to compliance_review.md', async () => {
    const cannedReply = '# Compliance report\n\nVERDICT: COMPLIANT\n\nAll stages entered.\n';
    const stub = makeStubPort({ cannedReply });
    const reviewer = new ComplianceReviewer(stub.port, { noFsync: true });

    const result = await reviewer.review({
      projectPath: projectRoot,
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace: [
        { kind: 'task_started', methodologyId: 'demo-meth', taskId: 't1', ts: '2026-05-12T00:00:00Z' },
      ],
      artifacts: {},
    });

    expect(result.path).toBe(complianceReportPath(projectRoot, TASK_ID));
    expect(result.content).toContain('VERDICT: COMPLIANT');
    // Round-trip: file on disk matches returned content.
    const onDisk = await fsp.readFile(result.path, 'utf8');
    expect(onDisk).toBe(result.content);
  });

  test('passes the constructed prompt to the agent session', async () => {
    const stub = makeStubPort({ cannedReply: 'OK' });
    const reviewer = new ComplianceReviewer(stub.port, { noFsync: true });
    await reviewer.review({
      projectPath: projectRoot,
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace: [
        { kind: 'task_started', methodologyId: 'demo-meth', taskId: 't1', ts: '2026-05-12T00:00:00Z' },
        { kind: 'stage_entered', stageId: 'plan', ts: '2026-05-12T00:00:01Z' },
      ],
      artifacts: { 'plan.md': '# plan body' },
    });
    expect(stub.sentPrompts).toHaveLength(1);
    const sent = stub.sentPrompts[0];
    expect(sent).toContain('demo-meth');
    expect(sent).toContain('Meta status: completed');
    expect(sent).toContain('Trace events: 2');
    expect(sent).toContain('### Artifact: plan.md');
    expect(stub.startedConfigs).toHaveLength(1);
    expect(stub.startedConfigs[0]?.cwd).toBe(projectRoot);
  });

  test('accumulates multiple agent messages but ignores tool messages', async () => {
    const stub = makeStubPort({
      cannedReply: 'Part one.',
      extraReply: 'Part two.',
    });
    const reviewer = new ComplianceReviewer(stub.port, { noFsync: true });
    const result = await reviewer.review({
      projectPath: projectRoot,
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace: [],
      artifacts: {},
    });
    expect(result.content).toContain('Part one.');
    expect(result.content).toContain('Part two.');
    expect(result.content).not.toContain('tool-output-should-not-be-captured');
  });

  test('closes the agent session even when capture is empty', async () => {
    const stub = makeStubPort({ cannedReply: '' });
    const reviewer = new ComplianceReviewer(stub.port, { noFsync: true });
    const result = await reviewer.review({
      projectPath: projectRoot,
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace: [],
      artifacts: {},
    });
    // Empty capture still produces a (mostly empty) file ending in newline.
    expect(result.content.endsWith('\n')).toBe(true);
    expect(stub.closed.count).toBe(1);
  });

  test('atomic write — no leftover .tmp.* files in the task dir on success', async () => {
    const stub = makeStubPort({ cannedReply: 'OK' });
    const reviewer = new ComplianceReviewer(stub.port, { noFsync: true });
    await reviewer.review({
      projectPath: projectRoot,
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace: [],
      artifacts: {},
    });
    const taskDir = path.join(projectRoot, '.sherpa', 'tasks', TASK_ID);
    const entries = await fsp.readdir(taskDir);
    expect(entries).toContain('compliance_review.md');
    for (const e of entries) {
      expect(e).not.toMatch(/\.tmp\./);
    }
  });

  test('skipped-gate scenario: prompt highlights the preflight_failed event', async () => {
    // Real assertion the plan asked for: the prompt sent to the agent must
    // include the events that document the skipped gate, so the reviewer can
    // cite them in the verdict.
    const trace: TraceEventLike[] = [
      { kind: 'stage_entered', stageId: 'plan', ts: '2026-05-12T00:00:01Z' },
      { kind: 'preflight_failed', stageId: 'gate1', checkId: 'artifact_written', ts: '2026-05-12T00:00:02Z' },
      { kind: 'task_completed', ts: '2026-05-12T00:00:03Z' },
    ];
    const stub = makeStubPort({
      cannedReply: 'VERDICT: NON_COMPLIANT — gate1 preflight skipped.',
    });
    const reviewer = new ComplianceReviewer(stub.port, { noFsync: true });
    const result = await reviewer.review({
      projectPath: projectRoot,
      taskId: TASK_ID,
      methodology: makeMethodology(),
      meta: makeMeta(),
      trace,
      artifacts: {},
    });
    const sent = stub.sentPrompts[0];
    expect(sent).toContain('"kind":"preflight_failed"');
    expect(sent).toContain('"checkId":"artifact_written"');
    // And the stubbed verdict made it to disk.
    expect(result.content).toContain('NON_COMPLIANT');
  });
});
