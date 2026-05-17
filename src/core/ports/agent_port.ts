import type { AgentMessage, AgentSessionId, AgentSessionConfig } from '../domain/agent';

export interface AgentSession {
  readonly id: AgentSessionId;
  send(text: string): Promise<void>;
  /** Subscribes to agent output. Returns unsubscribe fn. */
  onMessage(cb: (msg: AgentMessage) => void): () => void;
  /** Resolves when the current turn completes (agent stops producing output). */
  awaitTurn(): Promise<void>;
  close(): Promise<void>;
  /** Usage stats populated after awaitTurn() resolves (worker mode only). */
  readonly usage?: {
    cost: number | null;
    tokens: { input: number; output: number } | null;
  };
  /** Claude Code session ID returned in the `result` event. Pass as
   *  `resumeSessionId` on the next call to `startSession` to continue
   *  the conversation without losing history. Undefined until awaitTurn(). */
  readonly returnedSessionId?: string;
}

export interface AgentPort {
  /** Provider id, e.g. 'claude-code'. */
  readonly providerId: string;
  /** Starts a new session. */
  startSession(config: AgentSessionConfig): Promise<AgentSession>;
  /** Health check — is the underlying CLI available? */
  health(): Promise<{ ok: true } | { ok: false; reason: string }>;
}
