// Agent runtime types used by the AgentPort + ClaudeCodeAdapter + master chat.

export type AgentMessageRole = 'user' | 'agent' | 'system' | 'tool';

export interface AgentMessage {
  readonly id: string;
  readonly role: AgentMessageRole;
  readonly text: string;
  readonly toolCall?: ToolCall;
  readonly timestamp: string;       // ISO 8601
}

export interface ToolCall {
  readonly name: string;            // e.g. 'Read', 'Edit', 'Bash'
  readonly args: Record<string, unknown>;
  readonly result?: string;         // empty until completion
  readonly status: 'pending' | 'success' | 'error';
}

export interface AgentSessionId {
  readonly value: string;           // stable across send/receive within one session
}

export interface AgentSessionConfig {
  readonly cwd: string;             // project root (used for --add-dir tool access)
  /** Working directory for spawning Claude Code. Defaults to `cwd` when omitted.
   *  Set to a neutral dir (e.g. os.tmpdir()) in free-chat to avoid loading the
   *  project's CLAUDE.md / hooks which may inject superpowers context. */
  readonly spawnCwd?: string;
  readonly systemPrompt?: string;
  readonly model?: string;          // model identifier if applicable
  /** Maximum seconds without output before considering the session stuck. */
  readonly idleTimeoutSec?: number;
  /**
   * Plan 4 spike: 'worker' uses stream-json + tools enabled;
   * 'translator' uses json + tools disabled. Default 'worker'.
   */
  readonly mode?: 'worker' | 'translator';
  /**
   * Plan 8b Task 7 — economy mode cap. When set, the adapter passes
   * `--max-budget-usd <value>` to the underlying CLI.
   */
  readonly maxBudgetUsd?: number;
  /** Claude Code session ID from the previous turn. When set the adapter passes
   *  `--resume <resumeSessionId>` instead of `--session-id <new-uuid>` so the
   *  agent sees the full conversation history from the prior turn. */
  readonly resumeSessionId?: string;
  /** Claude Code --permission-mode value. Default 'bypassPermissions' when absent. */
  readonly permissionMode?: 'bypassPermissions' | 'acceptEdits' | 'auto';
  /**
   * Absolute path to a temp JSON file containing MCP server config for this
   * turn. When set the adapter passes `--mcp-config <path>` to Claude Code.
   * The file is deleted in `close()` along with the system-prompt temp file.
   */
  readonly mcpConfigPath?: string;
}

export function isAgentMessage(v: unknown): v is AgentMessage {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string'
    && typeof r.role === 'string'
    && ['user', 'agent', 'system', 'tool'].includes(r.role as string)
    && typeof r.text === 'string'
    && typeof r.timestamp === 'string';
}
