import type { AgentPort } from '../../core/ports/agent_port';
import type { AgentMessage } from '../../core/domain/agent';
import type { Methodology, Stage } from '../../core/domain/methodology';
import type { Task } from '../../core/domain/task';
import { SystemPromptAssembler } from './system_prompt_assembler';

/**
 * Adapts agent output text for display to the end user.
 * Pure function — no network call, no re-generation.
 *
 * Only strips CLI-era stage tags like "[W1 | #abc Title]" from the first
 * line. The agent already responds in the user's language (Russian users
 * write in Russian; Claude Code mirrors language). A separate Claude
 * "translator" session caused role confusion — it received orchestration
 * menus from the agent and re-generated them as if they were tasks.
 */
export function adaptForUser(text: string): string {
  return text.replace(/^\[(?:W\d+(?:\.\d+)?|R\d+)[^\]]*\]\s*\n?/, '');
}

export interface MasterChatTurn {
  readonly userMessage: string;
  readonly methodology: Methodology;
  readonly stage: Stage;
  readonly task: Task;
  readonly cwd: string;
  /** Pre-loaded input artifacts (path → content). */
  readonly inputArtifacts?: ReadonlyMap<string, string>;
  /**
   * Claude Code session ID from the previous turn on this stage.
   * When set, passed as `--resume` so the agent sees the full conversation
   * history without re-reading the same files from scratch.
   */
  readonly resumeSessionId?: string;
  /** Permission mode override — passed through to AgentSessionConfig. */
  readonly permissionMode?: 'bypassPermissions' | 'acceptEdits' | 'auto';
  /**
   * Absolute path to the temp MCP config JSON file for this turn.
   * When set, passed to `AgentSessionConfig.mcpConfigPath` so Claude Code
   * receives `--mcp-config` and can call the `sherpa_stage_complete` tool.
   */
  readonly mcpConfigPath?: string;
}

export interface MasterChatResult {
  /** Raw output from the worker session (user/agent/tool messages). */
  readonly workerOutput: readonly AgentMessage[];
  /**
   * Adapted user-facing text (stage tag stripped; same language as agent).
   * Empty string when the worker produced no agent-role messages.
   */
  readonly translatedText: string;
  /** Total cost in USD (null if not available). */
  readonly cost: number | null;
  /** Token usage (null if not available). */
  readonly tokens: { input: number; output: number } | null;
  /**
   * Claude Code session ID returned by the worker. Persist this and pass
   * back as `resumeSessionId` on the next turn to maintain conversation
   * history within the same stage.
   */
  readonly returnedSessionId?: string;
}

export class MasterChatController {
  private readonly assembler: SystemPromptAssembler;

  constructor(
    private readonly agent: AgentPort,
    assembler?: SystemPromptAssembler,
  ) {
    this.assembler = assembler ?? new SystemPromptAssembler();
  }

  async runTurn(
    turn: MasterChatTurn,
    onMessage?: (msg: AgentMessage) => void,
  ): Promise<MasterChatResult> {
    // 1. Build full system prompt via assembler.
    const assembled = await this.assembler.assemble({
      methodology: turn.methodology,
      stage: turn.stage,
      task: turn.task,
      projectPath: turn.cwd,
      inputArtifacts: turn.inputArtifacts ?? new Map(),
    });

    // 2. Worker run — resumeSessionId carries conversation history across turns.
    const worker = await this.agent.startSession({
      cwd: turn.cwd,
      systemPrompt: assembled.systemPrompt,
      mode: 'worker',
      resumeSessionId: turn.resumeSessionId,
      permissionMode: turn.permissionMode,
      mcpConfigPath: turn.mcpConfigPath,
    });
    const collected: AgentMessage[] = [];
    const unsubscribe = worker.onMessage((m) => {
      collected.push(m);
      onMessage?.(m);
    });
    try {
      await worker.send(turn.userMessage);
      await worker.awaitTurn();
    } finally {
      unsubscribe();
      await worker.close();
    }

    const workerUsage = worker.usage;
    const cost = workerUsage?.cost ?? null;
    const tokens = workerUsage?.tokens ?? null;
    const returnedSessionId = worker.returnedSessionId;

    // 3. Adapt agent text — pure function, no extra Claude session.
    const finalAgentText = collected
      .filter((m) => m.role === 'agent')
      .map((m) => m.text)
      .join('\n');

    // adaptForUser strips CLI-era stage tags. Result available for callers
    // but not re-emitted — AgentTextBubble already strips tags in the UI.
    const translatedText = finalAgentText.trim().length > 0
      ? adaptForUser(finalAgentText)
      : '';

    return { workerOutput: collected, translatedText, cost, tokens, returnedSessionId };
  }
}
