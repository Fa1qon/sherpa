// src/main/adapters/stub_agent_adapter.ts
//
// Plan 8 Task 20 — deterministic stub AgentPort for end-to-end tests.
//
// Implements the same surface as ClaudeCodeAdapter (AgentPort + AgentSession)
// but never spawns a child process. Every session:
//   - records `send()` text into a shared transcript so tests can assert
//     on the assembled stage prompt later if they want;
//   - emits one canned "agent" message via onMessage(), so consumers that
//     listen for output (ComplianceReviewer, MasterChatController) get a
//     non-empty reply;
//   - resolves awaitTurn() immediately so MethodologyRunner moves forward.
//
// Gate evaluation is the engine's concern, not this adapter's: when a task
// runs against a methodology whose stages either have no gate (auto-pass via
// `no_gate`) or have gate items that auto-satisfy under strictness='autonomous',
// the engine will reach `task_completed` without any real model output.
//
// Composition-root wiring is opt-in: when the env var SHERPA_STUB_ADAPTER=1
// is set at process start, buildContainer() registers this stub in place of
// the ClaudeCodeAdapter. Absent the env var, behaviour is unchanged.
//
// Strict TS; no new runtime deps; no IPC.

import type { AgentPort, AgentSession } from '../../core/ports/agent_port';
import type {
  AgentMessage,
  AgentSessionConfig,
  AgentSessionId,
} from '../../core/domain/agent';

export interface StubAgentOptions {
  /** Text emitted as the canned agent reply. Default: short COMPLIANT verdict. */
  readonly cannedReply?: string;
  /** Override session-id generator (defaults to incrementing counter). */
  readonly sessionIdFactory?: () => string;
  /**
   * Optional side-effect invoked on every `session.send(text)` call.
   * Useful for producing fake per-turn artifact writes so UI panels
   * have something to surface during e2e flows. Failures are caught
   * and swallowed so a buggy callback never crashes the adapter.
   * The adapter does NOT know taskId/stageId — composition_root has
   * the simpler per-stage hook via runner.on('event'). Kept here for
   * future call-sites that build sessions outside the engine.
   */
  readonly onSend?: (config: AgentSessionConfig, text: string) => void | Promise<void>;
}

const DEFAULT_REPLY =
  'COMPLIANT — stub adapter response. All stages traversed; gates auto-satisfied under autonomous strictness.';

/**
 * In-memory AgentPort that returns immediately on every operation.
 * The MethodologyRunner / ComplianceReviewer can drive end-to-end flows
 * against it without touching a real CLI.
 */
export class StubAgentAdapter implements AgentPort {
  readonly providerId = 'stub';

  /** Every prompt ever sent via this adapter, in order. Useful for assertions. */
  readonly sentPrompts: string[] = [];
  /** Number of sessions opened. */
  sessionsOpened = 0;
  /** Number of sessions closed. */
  sessionsClosed = 0;

  private readonly cannedReply: string;
  private readonly nextSessionId: () => string;
  private readonly onSend: StubAgentOptions['onSend'];

  constructor(opts: StubAgentOptions = {}) {
    this.cannedReply = opts.cannedReply ?? DEFAULT_REPLY;
    let counter = 0;
    this.nextSessionId =
      opts.sessionIdFactory ?? ((): string => `stub-session-${++counter}`);
    this.onSend = opts.onSend;
  }

  async health(): Promise<{ ok: true } | { ok: false; reason: string }> {
    return { ok: true };
  }

  async startSession(config: AgentSessionConfig): Promise<AgentSession> {
    this.sessionsOpened++;
    const id: AgentSessionId = { value: this.nextSessionId() };
    const listeners = new Set<(m: AgentMessage) => void>();
    const reply = this.cannedReply;
    const recordPrompt = (t: string): void => {
      this.sentPrompts.push(t);
    };
    const incClosed = (): void => {
      this.sessionsClosed++;
    };
    const onSend = this.onSend;
    const sessionConfig = config;

    const session: AgentSession = {
      id,
      onMessage(cb): () => void {
        listeners.add(cb);
        return (): void => {
          listeners.delete(cb);
        };
      },
      async send(text: string): Promise<void> {
        recordPrompt(text);
        if (onSend) {
          try {
            await onSend(sessionConfig, text);
          } catch {
            // Side-effect failures must not break the session.
          }
        }
        const msg: AgentMessage = {
          id: `stub-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'agent',
          text: reply,
          timestamp: new Date().toISOString(),
        };
        for (const l of listeners) l(msg);
      },
      async awaitTurn(): Promise<void> {
        // Resolve immediately — there is no real model turn to wait for.
      },
      async close(): Promise<void> {
        incClosed();
        listeners.clear();
      },
    };
    return session;
  }
}

/**
 * Returns true iff the runtime requested stub-adapter mode via env var.
 * Centralised so composition_root + tests + future tooling agree on the
 * exact signal.
 */
export function isStubAdapterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SHERPA_STUB_ADAPTER;
  return v === '1' || v === 'true';
}
