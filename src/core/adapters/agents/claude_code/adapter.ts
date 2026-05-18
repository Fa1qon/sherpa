// ClaudeCodeAdapter — Plan 4 rewrite.
//
// Implements `AgentPort` / `AgentSession` (src/core/ports/agent_port.ts) on
// top of the Claude Code CLI's non-interactive invocation mode:
//
//   worker:     `claude -p --output-format stream-json --verbose ...`
//   translator: `claude -p --output-format json --tools "" --no-session-persistence ...`
//
// Reference research (run against claude 2.1.139, OAuth-authenticated):
//   docs/superpowers/research/2026-05-12-claude-cli-integration.md
//
// What we deliberately do NOT do here (and why):
//   * No PTY. `-p` mode is plain pipe stdio; node:child_process.spawn is fine.
//   * No ANSI parsing. stream-json is NDJSON; -p text mode has no ANSI either.
//   * No REPL state machine. Each `send()` spawns a one-shot process that
//     exits on `{"type":"result"}`. Multi-turn chaining is the caller's job
//     (Plan 5 will use --resume <session-id> across processes).
//   * No login flow. OAuth is browser-driven via `claude auth login`; the
//     adapter only reports "not authenticated" via health()/spawn failures.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AgentPort, AgentSession } from '../../../ports/agent_port';
import type {
  AgentMessage,
  AgentSessionConfig,
  AgentSessionId,
  ToolCall,
} from '../../../domain/agent';
import { parseVersion, compareSemver, MIN_SUPPORTED_VERSION } from './capabilities';

const IS_WINDOWS = process.platform === 'win32';
const DEFAULT_IDLE_TIMEOUT_SEC = 300;

/* ------------------------------------------------------------------ */
/* Public surface                                                      */
/* ------------------------------------------------------------------ */

export interface ClaudeCodeAdapterOptions {
  /** Absolute path to claude (or claude.cmd on Windows). Default: resolved from PATH. */
  readonly cliPath?: string;
  /**
   * Override the spawn function for tests. Must be call-compatible with
   * node:child_process.spawn and return a `ChildProcess`-like with
   * stdout / stderr / stdin / on / kill / exitCode.
   */
  readonly spawnImpl?: typeof spawn;
  /**
   * Called at each spawn to get current proxy env vars. Reading at call-time
   * ensures live updates are picked up — a change to ProxyManager settings
   * will be reflected in the very next Claude Code turn without a restart.
   * Intended for proxy routing: the main-layer composition root reads from
   * ProxyManager and passes HTTP_PROXY / HTTPS_PROXY / NO_PROXY here so the
   * core adapter stays dependency-free (no main→core import violation).
   * Both upper and lower case variants are set so Node.js and libcurl honour
   * the proxy regardless of which case they inspect.
   */
  readonly getProxyEnv?: () => Readonly<Record<string, string>>;
}

export class ClaudeCodeAdapter implements AgentPort {
  readonly providerId = 'claude-code';
  private readonly cliPath: string | null;
  private readonly spawnImpl: typeof spawn;
  private readonly getProxyEnv: (() => Readonly<Record<string, string>>) | undefined;

  constructor(opts: ClaudeCodeAdapterOptions = {}) {
    // If the caller passes `cliPath` explicitly, honour it as-is — an empty
    // string is the supported way to opt into "no binary on PATH" (useful
    // for tests and for surfacing the not-installed UX deterministically).
    // Only fall back to PATH lookup when the caller didn't set the option.
    if (opts.cliPath !== undefined) {
      this.cliPath = opts.cliPath.length > 0 ? opts.cliPath : null;
    } else {
      this.cliPath = resolveClaudeBinary();
    }
    this.spawnImpl = opts.spawnImpl ?? spawn;
    this.getProxyEnv = opts.getProxyEnv;
  }

  async health(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.cliPath) {
      return { ok: false, reason: 'claude CLI not found on PATH' };
    }
    let result: ReturnType<typeof spawnSync>;
    try {
      result = spawnSync(this.cliPath, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `failed to spawn claude --version: ${msg}` };
    }
    if (result.status !== 0) {
      return {
        ok: false,
        reason: `claude --version exited ${String(result.status)}`,
      };
    }
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const parsed = parseVersion(output);
    if (!parsed) {
      return { ok: false, reason: `could not parse claude version: ${output.trim()}` };
    }
    if (compareSemver(parsed, MIN_SUPPORTED_VERSION) < 0) {
      return {
        ok: false,
        reason: `claude ${parsed} < required ${MIN_SUPPORTED_VERSION}`,
      };
    }
    return { ok: true };
  }

  async startSession(config: AgentSessionConfig): Promise<AgentSession> {
    if (!this.cliPath) throw new Error('claude CLI not found on PATH');
    return new ClaudeCodeSession(this.cliPath, config, this.spawnImpl, this.getProxyEnv);
  }
}

/* ------------------------------------------------------------------ */
/* Session implementation                                              */
/* ------------------------------------------------------------------ */

class ClaudeCodeSession implements AgentSession {
  readonly id: AgentSessionId = { value: randomUUID() };

  private readonly listeners = new Set<(m: AgentMessage) => void>();
  private proc: ChildProcess | null = null;
  private turnDonePromise: Promise<void> | null = null;
  /** Map tool_use_id → { pending ToolCall + the message id we already emitted }. */
  private readonly toolCallsById = new Map<string, { toolCall: ToolCall; msgId: string }>();
  private systemPromptFile: string | null = null;
  private mcpConfigFile: string | null = null;
  /** Usage stats extracted from the worker's `result` event. */
  private _usage: { cost: number | null; tokens: { input: number; output: number } | null } = {
    cost: null,
    tokens: null,
  };
  get usage(): { cost: number | null; tokens: { input: number; output: number } | null } {
    return this._usage;
  }
  /** Claude Code session ID from the `result` event — pass to resumeSessionId on next turn. */
  private _returnedSessionId: string | null = null;
  get returnedSessionId(): string | undefined {
    return this._returnedSessionId ?? undefined;
  }
  /**
   * Stdout buffer for NDJSON parsing — we may receive partial lines and
   * must accumulate across data events until '\n' arrives.
   */
  private stdoutBuf = '';
  private closed = false;
  /**
   * Synchronous sentinel: set the moment send() enters its async body so
   * a parallel send() can be rejected before either reaches the await
   * for buildWorkerArgs(). Not reset on success — `this.proc` then guards.
   */
  private starting = false;
  /** Idle watchdog — reset on each stdout chunk; cleared on resolve/reject/exit. */
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cliPath: string,
    private readonly config: AgentSessionConfig,
    private readonly spawnImpl: typeof spawn,
    private readonly getProxyEnv?: () => Readonly<Record<string, string>>,
  ) {}

  onMessage(cb: (m: AgentMessage) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async send(text: string): Promise<void> {
    if (this.proc || this.starting) {
      throw new Error('session already in use; spike supports one turn per session');
    }
    this.starting = true;
    try {
      const mode = this.config.mode ?? 'worker';
      const rawArgs =
        mode === 'translator' ? await this.buildTranslatorArgs() : await this.buildWorkerArgs();

      // CVE-2024-27980 workaround: as of Node 18.20.2 / 20.12.2 / 21.7.2,
      // spawn() refuses to execute .cmd/.bat directly unless shell:true.
      // Our binary resolver prefers `claude.cmd` on Windows, so we must
      // route through the shell on that platform.
      const useShell =
        IS_WINDOWS && this.cliPath.toLowerCase().endsWith('.cmd');

      // When shell:true, cmd.exe sees the entire command line as a string —
      // any value containing whitespace (notably --add-dir <cwd> and
      // --system-prompt-file <tmp>) must be wrapped in double quotes so it
      // arrives at claude.cmd as a single argv element. cmd.exe only honors
      // double quotes. We quote defensively: every value position (not flag
      // names) after the known path-bearing flags.
      const quoteIfWin = (s: string): string =>
        useShell ? `"${s.replaceAll('"', '\\"')}"` : s;
      const PATH_FLAGS = new Set(['--add-dir', '--system-prompt-file', '--mcp-config']);
      const args: string[] = rawArgs.map((a, idx) => {
        const prev = idx > 0 ? rawArgs[idx - 1] : undefined;
        if (prev !== undefined && PATH_FLAGS.has(prev)) return quoteIfWin(a);
        return a;
      });

      this.proc = this.spawnImpl(this.cliPath, args, {
        cwd: this.config.spawnCwd ?? this.config.cwd,
        env: { ...process.env, FORCE_COLOR: '0', ...(this.getProxyEnv ? this.getProxyEnv() : {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: useShell,
      });

      this.turnDonePromise = this.streamOutput(mode);
      // Attach a no-op handler so that if the caller never awaits awaitTurn()
      // (e.g. close-without-await), node doesn't log an unhandled rejection.
      // awaitTurn() still re-awaits the same promise so the rejection
      // propagates to anyone who does care.
      this.turnDonePromise.catch(() => {
        /* swallow — observed via awaitTurn() if caller wants it */
      });

      if (this.proc.stdin) {
        // If claude died instantly (e.g. spawn failed post-fork on Windows),
        // stdin can emit 'error' before/during .end(). Attach a no-op error
        // handler first so the EPIPE/ECONNRESET doesn't crash the host.
        this.proc.stdin.on('error', () => {
          /* swallow — turn-done promise will reject via proc 'error' / non-zero exit */
        });
        this.proc.stdin.end(text);
      }
    } catch (e) {
      this.starting = false;
      throw e;
    }
  }

  async awaitTurn(): Promise<void> {
    if (!this.turnDonePromise) return;
    await this.turnDonePromise;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.proc && this.proc.exitCode === null) {
      // Windows: `kill()` calls TerminateProcess on the .cmd shim only; the
      // underlying `node claude-cli.js` becomes orphaned. Plan 5 should use
      // `taskkill /F /T /PID <pid>` for tree termination.
      try {
        this.proc.kill('SIGTERM');
      } catch {
        /* swallow — best-effort */
      }
    }

    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.systemPromptFile) {
      try {
        await fsp.unlink(this.systemPromptFile);
      } catch {
        /* swallow — best-effort */
      }
      this.systemPromptFile = null;
    }
    if (this.mcpConfigFile) {
      try {
        await fsp.unlink(this.mcpConfigFile);
      } catch {
        /* swallow — best-effort */
      }
      this.mcpConfigFile = null;
    }
  }

  /* -------------------------- argv builders -------------------------- */

  private async buildWorkerArgs(): Promise<string[]> {
    const systemPromptFile = await this.writeSystemPromptFile(
      this.config.systemPrompt ?? '',
    );
    this.systemPromptFile = systemPromptFile;
    const args: string[] = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--system-prompt-file', systemPromptFile,
      '--permission-mode', this.config.permissionMode ?? 'bypassPermissions',
      '--add-dir', this.config.cwd,
    ];
    // Resume the prior Claude Code session so conversation history is preserved.
    // On the first turn (no resumeSessionId), start a fresh session identified
    // by our own UUID so we have a stable handle for close() / idle tracking.
    if (this.config.resumeSessionId) {
      args.push('--resume', this.config.resumeSessionId);
    } else {
      args.push('--session-id', this.id.value);
    }
    // Plan 8b Task 7 — effort→model + economy→budget mapping. Both flags
    // are surfaced only when caller-set so existing fixtures stay
    // bit-identical.
    if (typeof this.config.model === 'string' && this.config.model.length > 0) {
      args.push('--model', this.config.model);
    }
    if (
      typeof this.config.maxBudgetUsd === 'number' &&
      Number.isFinite(this.config.maxBudgetUsd) &&
      this.config.maxBudgetUsd > 0
    ) {
      args.push('--max-budget-usd', this.config.maxBudgetUsd.toFixed(2));
    }
    if (
      typeof this.config.mcpConfigPath === 'string' &&
      this.config.mcpConfigPath.length > 0
    ) {
      args.push('--mcp-config', this.config.mcpConfigPath);
      this.mcpConfigFile = this.config.mcpConfigPath;
    }
    return args;
  }

  private async buildTranslatorArgs(): Promise<string[]> {
    const systemPromptFile = await this.writeSystemPromptFile(
      this.config.systemPrompt ?? '',
    );
    this.systemPromptFile = systemPromptFile;
    return [
      '-p',
      '--output-format', 'json',
      '--system-prompt-file', systemPromptFile,
      '--tools', '',
      '--no-session-persistence',
      '--permission-mode', 'auto',
    ];
  }

  private async writeSystemPromptFile(content: string): Promise<string> {
    const file = path.join(tmpdir(), `sherpa-claude-system-${randomUUID()}.txt`);
    await fsp.writeFile(file, content, 'utf8');
    return file;
  }

  /* -------------------------- stream parsing ------------------------- */

  /**
   * Reads stdout, parses events, emits AgentMessages, and resolves when
   * the turn completes. Resolution rule:
   *   worker:     resolves on first `{"type":"result"}` line OR on process
   *               exit (whichever comes first); then awaits process exit so
   *               close() does not race a still-running child.
   *   translator: resolves on process exit (single-shot json — we buffer
   *               all stdout, then parse and emit one message).
   *
   * Safety: a `config.idleTimeoutSec` watchdog kills the child if no
   * stdout / no exit / no result event arrives within the window.
   */
  private streamOutput(mode: 'worker' | 'translator'): Promise<void> {
    const proc = this.proc;
    if (!proc) return Promise.resolve();

    const idleSec = this.config.idleTimeoutSec ?? DEFAULT_IDLE_TIMEOUT_SEC;
    const idleMs = Math.max(0, idleSec * 1000);

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      let sawResult = false;

      const clearIdleTimer = (): void => {
        if (this.idleTimer !== null) {
          clearTimeout(this.idleTimer);
          this.idleTimer = null;
        }
      };

      const onIdleTimeout = (): void => {
        if (resolved) return;
        try {
          proc.kill('SIGTERM');
        } catch {
          /* swallow */
        }
        if (!resolved) {
          resolved = true;
          clearIdleTimer();
          reject(new Error(`idle timeout after ${idleSec}s with no stdout in window`));
        }
      };

      const resetIdleTimer = (): void => {
        clearIdleTimer();
        this.idleTimer = setTimeout(onIdleTimeout, idleMs);
        // Don't keep the event loop alive solely on the watchdog.
        if (typeof this.idleTimer.unref === 'function') this.idleTimer.unref();
      };

      resetIdleTimer();

      const finishOnce = (): void => {
        if (resolved) return;
        resolved = true;
        clearIdleTimer();
        resolve();
      };

      const handleStdoutChunk = (chunk: Buffer | string): void => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        this.stdoutBuf += text;
        // Got data — reset the idle watchdog. (Doing this BEFORE parsing
        // matches the docstring "no stdout in window".)
        resetIdleTimer();

        if (mode === 'worker') {
          // Split on LF (or CRLF). Keep trailing partial line in buffer.
          const lines = this.stdoutBuf.split(/\r?\n/);
          this.stdoutBuf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let parsed: unknown;
            try {
              parsed = JSON.parse(trimmed);
            } catch {
              // Non-JSON line — skip silently. (Real claude stream-json
              // should never produce these, but be defensive.)
              continue;
            }
            const ended = this.handleWorkerEvent(parsed);
            if (ended) {
              sawResult = true;
              // Result event is the turn-end signal. Resolve now; exit
              // will happen shortly after — the promise stays "settled"
              // but we still leave the listeners attached so streaming
              // close events don't crash.
              finishOnce();
            }
          }
        }
        // Translator: buffer everything; parse on exit.
      };

      proc.stdout?.on('data', handleStdoutChunk);
      proc.stderr?.on('data', () => {
        // We intentionally swallow stderr here. Real Sherpa will surface
        // it via a future logging port. For Plan 4 spike: drop it on the
        // floor (Claude only writes diagnostic lines to stderr; tool
        // errors come back through the stream-json `tool_result` block).
      });

      proc.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearIdleTimer();
        reject(err);
      });

      proc.on('exit', (code) => {
        if (mode === 'translator') {
          // Parse the entire stdout as JSON now.
          const raw = this.stdoutBuf.trim();
          if (raw.length > 0) {
            try {
              const obj = JSON.parse(raw) as { result?: unknown };
              const resultText =
                typeof obj.result === 'string' ? obj.result : '';
              this.emit({
                id: randomUUID(),
                role: 'agent',
                text: resultText,
                timestamp: new Date().toISOString(),
              });
            } catch {
              // Malformed JSON — emit nothing; reject below if exit was bad.
            }
          }
          this.stdoutBuf = '';
        }

        if (!resolved) {
          if (mode === 'worker' && !sawResult && code !== 0) {
            resolved = true;
            clearIdleTimer();
            reject(
              new Error(
                `claude exited with code ${String(code)} before producing a result event`,
              ),
            );
            return;
          }
          finishOnce();
        }
      });
    });
  }

  /**
   * Process one parsed worker stream-json event. Returns true iff this
   * event signals end-of-turn (i.e. `type === 'result'`).
   *
   * Per research doc:
   *   - assistant.content[].tool_use  → pending tool call message
   *   - user.content[].tool_result    → completed tool call message
   *                                     (matched by tool_use_id)
   *   - assistant.content[].text       → agent text message
   *   - assistant.content[].thinking   → ignored (opaque)
   *   - system / hook_started / hook_response / rate_limit_event → ignored
   *   - result                          → turn-end signal; do NOT emit
   *                                     (the `text` already came through
   *                                     assistant blocks; emitting again
   *                                     would duplicate it)
   */
  private handleWorkerEvent(ev: unknown): boolean {
    if (typeof ev !== 'object' || ev === null) return false;
    const r = ev as Record<string, unknown>;
    const type = r.type;

    if (type === 'result') {
      const cost = typeof r.total_cost_usd === 'number' ? r.total_cost_usd : null;
      const usage = r.usage as { input_tokens?: unknown; output_tokens?: unknown } | undefined;
      const ti = typeof usage?.input_tokens === 'number' ? usage.input_tokens : null;
      const to = typeof usage?.output_tokens === 'number' ? usage.output_tokens : null;
      this._usage = { cost, tokens: ti !== null && to !== null ? { input: ti, output: to } : null };
      // Capture the session ID so the caller can pass --resume on the next turn.
      if (typeof r.session_id === 'string' && r.session_id.length > 0) {
        this._returnedSessionId = r.session_id;
      }
      return true;
    }

    if (type === 'assistant') {
      const message = r.message as { content?: unknown } | undefined;
      const blocks = Array.isArray(message?.content) ? message.content : [];
      for (const block of blocks as Array<Record<string, unknown>>) {
        const btype = block.type;
        if (btype === 'tool_use') {
          const id = typeof block.id === 'string' ? block.id : '';
          const name = typeof block.name === 'string' ? block.name : '';
          const input =
            typeof block.input === 'object' && block.input !== null
              ? (block.input as Record<string, unknown>)
              : {};
          const toolCall: ToolCall = {
            name,
            args: input,
            status: 'pending',
          };
          const msgId = randomUUID();
          if (id) this.toolCallsById.set(id, { toolCall, msgId });
          this.emit({
            id: msgId,
            role: 'tool',
            text: '',
            toolCall,
            timestamp: new Date().toISOString(),
          });
        } else if (btype === 'text') {
          const text = typeof block.text === 'string' ? block.text : '';
          if (text.length > 0) {
            this.emit({
              id: randomUUID(),
              role: 'agent',
              text,
              timestamp: new Date().toISOString(),
            });
          }
        }
        // thinking & unknown block types: ignored.
      }
      return false;
    }

    if (type === 'user') {
      const message = r.message as { content?: unknown } | undefined;
      const blocks = Array.isArray(message?.content) ? message.content : [];
      for (const block of blocks as Array<Record<string, unknown>>) {
        if (block.type !== 'tool_result') continue;
        const useId = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
        const isError = block.is_error === true;
        const rawContent = block.content;
        const resultText =
          typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
              ? rawContent
                  .map((c) => {
                    if (typeof c === 'string') return c;
                    if (typeof c === 'object' && c !== null && 'text' in c) {
                      const t = (c as { text?: unknown }).text;
                      return typeof t === 'string' ? t : '';
                    }
                    return '';
                  })
                  .join('')
              : JSON.stringify(rawContent ?? '');
        const pendingEntry = useId ? this.toolCallsById.get(useId) : undefined;
        const tc: ToolCall = pendingEntry
          ? {
              ...pendingEntry.toolCall,
              result: resultText,
              status: isError ? 'error' : 'success',
            }
          : {
              name: '',
              args: {},
              result: resultText,
              status: isError ? 'error' : 'success',
            };
        // Reuse the pending message's id so the store can replace it in-place
        // instead of appending a duplicate entry.
        this.emit({
          id: pendingEntry?.msgId ?? randomUUID(),
          role: 'tool',
          text: '',
          toolCall: tc,
          timestamp: new Date().toISOString(),
        });
      }
      return false;
    }

    // Ignore: system / hook_started / hook_response / rate_limit_event / unknown.
    return false;
  }

  private emit(msg: AgentMessage): void {
    for (const cb of this.listeners) {
      try {
        cb(msg);
      } catch {
        // Subscriber threw — isolate from other subscribers.
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Binary resolution                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resolve the `claude` binary on PATH. Returns the absolute path if found,
 * or null. Env overrides (in priority order):
 *   1. `CLAUDE_CODE_NODE_SCRIPT` — defer to caller; returns `process.execPath`
 *      so the spawn site can prepend the script to argv.
 *   2. `CLAUDE_CODE_PATH` — explicit absolute path override.
 *   3. PATH lookup via `where` (Windows) / `which` (POSIX). On Windows we
 *      prefer the `.cmd` entry because Node's `spawn()` cannot execute a
 *      bare bash shim — it returns ENOENT / "%1 is not a valid Win32
 *      application".
 */
function resolveClaudeBinary(): string | null {
  const nodeScript = process.env['CLAUDE_CODE_NODE_SCRIPT'];
  if (typeof nodeScript === 'string' && nodeScript.length > 0) {
    return process.execPath;
  }
  const explicit = process.env['CLAUDE_CODE_PATH'];
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }
  const cmd = IS_WINDOWS ? 'where' : 'which';
  try {
    const result = spawnSync(cmd, ['claude'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    const lines = result.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (IS_WINDOWS) {
      // Prefer .cmd — spawn() can't execute the bare bash shim on Windows.
      const cmdEntry = lines.find((l) => l.toLowerCase().endsWith('.cmd'));
      return cmdEntry ?? lines[0] ?? null;
    }
    return lines[0] ?? null;
  } catch {
    return null;
  }
}
