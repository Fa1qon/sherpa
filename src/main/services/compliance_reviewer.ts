// src/main/services/compliance_reviewer.ts
// Plan 8 Task 18 — built-in methodology-compliance reviewer.
//
// Reads a completed task's IR + meta.md + trace.jsonl + artifacts, builds a
// prompt for an AgentPort session, captures the agent's markdown output, and
// writes it atomically to `<project>/.sherpa/tasks/<taskId>/compliance_review.md`.
//
// The Plan 9 plugin loader will replace this hard-coded prompt with a
// disk-resident reviewer plugin; for v1 it lives inline next to the dispatch
// code so we ship a working reviewer without the registry round-trip.
//
// The class is dependency-injected: an AgentPort + an fs surface. Tests stub
// the AgentPort to deliver a canned response so the assertions stay
// deterministic and offline.
//
// Strict TS; no new runtime deps.

import path from 'node:path';
import type { AgentPort } from '../../core/ports/agent_port';
import type { AgentMessage } from '../../core/domain/agent';
import type { Methodology } from '../../core/domain/methodology';
import type { TaskMeta } from '../../core/domain/task_meta';
import { atomicWrite } from '../../core/infrastructure/atomic_write';

/**
 * Permissive trace event shape — matches LooseTraceEvent from trace_logger.ts
 * without importing the union type (keeps this service decoupled).
 */
export interface TraceEventLike {
  readonly kind: string;
  readonly ts?: string;
  readonly [field: string]: unknown;
}

export interface ComplianceReviewerInputs {
  readonly projectPath: string;
  readonly taskId: string;
  readonly methodology: Methodology;
  readonly meta: TaskMeta;
  readonly trace: readonly TraceEventLike[];
  /** Artifact file name → raw text contents. Order preserved by Map ordering. */
  readonly artifacts: Readonly<Record<string, string>>;
}

export interface ComplianceReviewerResult {
  readonly path: string;
  readonly content: string;
}

/** Where the markdown report lands inside the task dir. */
export function complianceReportPath(projectPath: string, taskId: string): string {
  return path.join(projectPath, '.sherpa', 'tasks', taskId, 'compliance_review.md');
}

/**
 * The prompt template. Renders to an English instruction block followed by
 * machine-readable data sections (JSON / markdown) so the agent can quote
 * specific evidence. Kept inline for v1 — Plan 9 moves it under `plugins/`.
 */
export function buildCompliancePrompt(args: ComplianceReviewerInputs): string {
  const traceLines = args.trace.map((e) => JSON.stringify(e)).join('\n');
  const artifactBlocks = Object.entries(args.artifacts)
    .map(([name, body]) => `### Artifact: ${name}\n\n${body.trim()}`)
    .join('\n\n');

  const lines: string[] = [];
  lines.push('You are reviewing whether an AI agent followed a methodology faithfully.');
  lines.push('');
  lines.push('Given:');
  lines.push('- The methodology IR (Methodology JSON)');
  lines.push('- The task meta.md');
  lines.push('- The trace.jsonl event log');
  lines.push('- All artifacts written during the task');
  lines.push('');
  lines.push('Produce a report with these sections:');
  lines.push('1. Stage-by-stage compliance — did the agent enter each declared stage? Did it write the required artifacts?');
  lines.push('2. Gate violations — did any gate auto-pass when it shouldn\'t have? Was the strictness preset respected?');
  lines.push('3. Edge anomalies — did the agent traverse edges that shouldn\'t have been satisfied? Rollback abuse?');
  lines.push('4. Counter integrity — did counter mutations match edge declarations?');
  lines.push('5. Verdict: COMPLIANT / PARTIAL_COMPLIANT / NON_COMPLIANT with specific evidence');
  lines.push('');
  lines.push('Output as markdown. The host will save your response verbatim to compliance_review.md.');
  lines.push('');
  lines.push(`Task: ${args.taskId}`);
  lines.push(`Methodology id: ${args.methodology.id} (version ${args.methodology.version})`);
  lines.push(`Meta status: ${args.meta.status ?? 'unknown'}`);
  lines.push(`Trace events: ${args.trace.length}`);
  lines.push('');
  lines.push('## Methodology IR (JSON)');
  lines.push('```json');
  lines.push(JSON.stringify(args.methodology, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Task meta (JSON)');
  lines.push('```json');
  lines.push(JSON.stringify(args.meta, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Trace events (NDJSON)');
  lines.push('```');
  lines.push(traceLines);
  lines.push('```');
  lines.push('');
  lines.push('## Artifacts');
  if (artifactBlocks.length > 0) {
    lines.push(artifactBlocks);
  } else {
    lines.push('_No artifacts captured._');
  }
  return lines.join('\n');
}

/**
 * Compliance reviewer. Constructor takes an AgentPort (real adapter in
 * production, stub in tests) and optional override for atomic write
 * (kept hidden behind a default so tests can fault-inject if needed).
 */
export class ComplianceReviewer {
  constructor(
    private readonly agent: AgentPort,
    private readonly opts: { readonly noFsync?: boolean } = {},
  ) {}

  /**
   * Run the reviewer agent and return the generated markdown content WITHOUT
   * writing it to disk. Use this for clipboard-only output modes.
   */
  async reviewContent(args: ComplianceReviewerInputs): Promise<string> {
    const prompt = buildCompliancePrompt(args);
    const captured: string[] = [];

    const session = await this.agent.startSession({
      cwd: args.projectPath,
      mode: 'worker',
      systemPrompt: 'You are a methodology compliance reviewer. Reply with markdown only.',
    });
    const unsubscribe = session.onMessage((m: AgentMessage) => {
      if (m.role === 'agent' && typeof m.text === 'string' && m.text.length > 0) {
        captured.push(m.text);
      }
    });
    try {
      await session.send(prompt);
      await session.awaitTurn();
    } finally {
      unsubscribe();
      await session.close();
    }

    return captured.join('\n').trim() + '\n';
  }

  async review(args: ComplianceReviewerInputs): Promise<ComplianceReviewerResult> {
    const content = await this.reviewContent(args);
    const target = complianceReportPath(args.projectPath, args.taskId);
    // Ensure parent dir exists (the task dir may exist already since trace lives there).
    const { promises: fsp } = await import('node:fs');
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await atomicWrite(target, content, { fsync: !this.opts.noFsync });
    return { path: target, content };
  }
}
