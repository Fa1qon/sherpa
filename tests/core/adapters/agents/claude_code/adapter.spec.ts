// Unit tests for ClaudeCodeAdapter (Plan 4 Task 5).
//
// Strategy: inject a fake `spawnImpl` (matching node:child_process.spawn) so
// we never touch the real `claude` binary. The fake returns a tiny mock
// child process built from EventEmitter + PassThrough streams so we can
// drive stdout NDJSON events deterministically.

import { describe, test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import {
  ClaudeCodeAdapter,
} from '../../../../../src/core/adapters/agents/claude_code';
import type { AgentMessage, AgentSessionConfig } from '../../../../../src/core/domain/agent';

/* ------------------------------------------------------------------ */
/* Mock ChildProcess factory                                           */
/* ------------------------------------------------------------------ */

interface MockChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
}

function makeMockChild(): MockChild {
  const ee = new EventEmitter() as MockChild;
  ee.stdout = new PassThrough();
  ee.stderr = new PassThrough();
  ee.stdin = new PassThrough();
  ee.exitCode = null;
  ee.kill = vi.fn((_sig?: string) => {
    if (ee.exitCode === null) ee.exitCode = 143;
    // Don't auto-emit exit on kill — let each test drive it.
    return true;
  });
  return ee;
}

/** Helper: write a JSON event followed by '\n' to stdout. */
function emitEvent(child: MockChild, obj: unknown): void {
  child.stdout.write(JSON.stringify(obj) + '\n');
}

/** Helper: drive process to exit. */
function exitChild(child: MockChild, code = 0): void {
  child.exitCode = code;
  child.stdout.end();
  child.stderr.end();
  // emit 'exit' AND 'close' (real node spawn emits both)
  child.emit('exit', code, null);
  child.emit('close', code, null);
}

/* ------------------------------------------------------------------ */
/* Tests                                                                */
/* ------------------------------------------------------------------ */

describe('ClaudeCodeAdapter — worker mode', () => {
  test('startSession + send + awaitTurn — emits tool-use, tool-result, agent-text', async () => {
    const child = makeMockChild();
    let capturedArgs: string[] = [];
    let capturedCmd = '';
    const spawnImpl = vi.fn((cmd: string, args: readonly string[], _opts: unknown) => {
      capturedCmd = cmd;
      capturedArgs = [...args];
      return child as unknown as ChildProcess;
    });

    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });

    const config: AgentSessionConfig = {
      cwd: process.cwd(),
      systemPrompt: 'You are a Sherpa worker',
      mode: 'worker',
      idleTimeoutSec: 10,
    };
    const session = await adapter.startSession(config);

    const received: AgentMessage[] = [];
    const unsub = session.onMessage((m) => received.push(m));

    await session.send('Please read README.md and summarise');

    // Spawn was invoked with the expected worker-mode argv.
    expect(capturedCmd).toBe('/fake/claude.cmd');
    expect(capturedArgs).toContain('-p');
    expect(capturedArgs).toContain('--output-format');
    expect(capturedArgs).toContain('stream-json');
    expect(capturedArgs).toContain('--verbose');
    expect(capturedArgs).toContain('--permission-mode');
    expect(capturedArgs).toContain('bypassPermissions');
    expect(capturedArgs).toContain('--add-dir');
    expect(capturedArgs).toContain('--session-id');
    expect(capturedArgs).toContain('--system-prompt-file');

    // Emit NDJSON events: assistant tool_use, user tool_result, assistant text, result.
    emitEvent(child, {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool_abc',
            name: 'Read',
            input: { file_path: '/x/README.md' },
          },
        ],
      },
    });
    emitEvent(child, {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool_abc',
            content: 'hello world',
            is_error: false,
          },
        ],
      },
    });
    emitEvent(child, {
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'ignored opaque block' },
          { type: 'text', text: 'The file says hello world.' },
        ],
      },
    });
    emitEvent(child, {
      type: 'result',
      subtype: 'success',
      result: 'The file says hello world.',
      is_error: false,
      session_id: 'sess-1',
    });
    exitChild(child, 0);

    await session.awaitTurn();
    unsub();

    expect(received.length).toBeGreaterThanOrEqual(3);

    const toolPending = received.find(
      (m) => m.role === 'tool' && m.toolCall?.status === 'pending',
    );
    expect(toolPending).toBeDefined();
    expect(toolPending?.toolCall?.name).toBe('Read');
    expect(toolPending?.toolCall?.args).toEqual({ file_path: '/x/README.md' });

    const toolDone = received.find(
      (m) => m.role === 'tool' && m.toolCall?.status === 'success',
    );
    expect(toolDone).toBeDefined();
    expect(toolDone?.toolCall?.name).toBe('Read');
    expect(toolDone?.toolCall?.result).toBe('hello world');

    const textMsg = received.find((m) => m.role === 'agent' && m.text.includes('hello world'));
    expect(textMsg).toBeDefined();

    // 'thinking' blocks must NOT be emitted.
    expect(received.some((m) => m.text.includes('opaque'))).toBe(false);

    await session.close();
  });

  test('close() kills running process and removes tempfile (best-effort)', async () => {
    const child = makeMockChild();
    const spawnImpl = vi.fn(
      (_cmd: string, _args: readonly string[], _opts: unknown) =>
        child as unknown as ChildProcess,
    );
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: 'tiny',
      mode: 'worker',
      idleTimeoutSec: 10,
    });

    await session.send('hi');

    // Inspect the system-prompt-file argv to grab the tempfile path.
    // On Windows the value is shell-quoted ("…") to survive cmd.exe; strip
    // the enclosing quotes before doing a filesystem access check.
    const args = (spawnImpl.mock.calls[0]?.[1] ?? []) as unknown as string[];
    const i = args.indexOf('--system-prompt-file');
    expect(i).toBeGreaterThanOrEqual(0);
    const rawTmp = args[i + 1] ?? '';
    const tmp = rawTmp.startsWith('"') && rawTmp.endsWith('"')
      ? rawTmp.slice(1, -1)
      : rawTmp;
    await expect(fsp.access(tmp)).resolves.toBeUndefined();

    // close() should kill the process and unlink the tempfile.
    const closePromise = session.close();
    // Drive the exit so awaitTurn (if it were still running) can settle —
    // but we have not awaited it; for this test we only care about close().
    exitChild(child, 143);
    await closePromise;

    expect(child.kill).toHaveBeenCalled();
    await expect(fsp.access(tmp)).rejects.toThrow();
  });

  test('idle timer resets on each stdout chunk (does not idle-timeout if chunks keep arriving)', async () => {
    const child = makeMockChild();
    const spawnImpl = vi.fn(() => child as unknown as ChildProcess);
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 0.15, // 150ms window
    });

    await session.send('go');

    // Drip events at 100ms intervals — each should reset the watchdog.
    // Total elapsed exceeds 150ms but no single gap does. Then result + exit at 400ms.
    setTimeout(() => emitEvent(child, { type: 'assistant', message: { content: [{ type: 'text', text: 'a' }] } }), 100);
    setTimeout(() => emitEvent(child, { type: 'assistant', message: { content: [{ type: 'text', text: 'b' }] } }), 200);
    setTimeout(() => emitEvent(child, { type: 'assistant', message: { content: [{ type: 'text', text: 'c' }] } }), 300);
    setTimeout(() => {
      emitEvent(child, { type: 'result', subtype: 'success', result: 'abc', is_error: false });
      exitChild(child, 0);
    }, 400);

    // Should resolve cleanly — NOT throw an idle-timeout.
    await expect(session.awaitTurn()).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
    await session.close();
  });

  test('parallel send() calls — second rejects with "already in use"', async () => {
    const child = makeMockChild();
    const spawnImpl = vi.fn(() => child as unknown as ChildProcess);
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 10,
    });

    const p1 = session.send('first');
    const p2 = session.send('second');

    await expect(p2).rejects.toThrow(/already in use/);
    // Resolve the first by emitting result + exit, then await it.
    emitEvent(child, { type: 'result', subtype: 'success', result: '', is_error: false });
    exitChild(child, 0);
    await p1;
    await session.awaitTurn();
    await session.close();
  });

  test('idle timeout kills child if no events arrive', async () => {
    const child = makeMockChild();
    const spawnImpl = vi.fn(() => child as unknown as ChildProcess);
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 0.05, // 50ms
    });

    await session.send('go');

    // Don't emit anything; wait long enough for timer to fire then exit.
    await new Promise((r) => setTimeout(r, 100));
    // The adapter's timer should have called kill().
    expect(child.kill).toHaveBeenCalled();

    // Simulate the kill actually finishing the process.
    exitChild(child, 143);
    await expect(session.awaitTurn()).rejects.toThrow(/idle timeout/i);
    await session.close();
  });

  test('returnedSessionId captured from result.session_id', async () => {
    const child = makeMockChild();
    const spawnImpl = vi.fn(() => child as unknown as ChildProcess);
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 10,
    });
    await session.send('hi');
    expect(session.returnedSessionId).toBeUndefined(); // not yet — awaiting turn
    emitEvent(child, {
      type: 'result',
      subtype: 'success',
      result: '',
      is_error: false,
      session_id: 'sess-captured-42',
    });
    exitChild(child, 0);
    await session.awaitTurn();
    expect(session.returnedSessionId).toBe('sess-captured-42');
    await session.close();
  });

  test('--resume flag passed when resumeSessionId set; no --session-id', async () => {
    const child = makeMockChild();
    let capturedArgs: string[] = [];
    const spawnImpl = vi.fn((_cmd: string, args: readonly string[]) => {
      capturedArgs = [...args];
      return child as unknown as ChildProcess;
    });
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 10,
      resumeSessionId: 'prev-session-uuid',
    });
    await session.send('continue');
    const resumeIdx = capturedArgs.indexOf('--resume');
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(capturedArgs[resumeIdx + 1]).toBe('prev-session-uuid');
    expect(capturedArgs).not.toContain('--session-id');
    emitEvent(child, { type: 'result', subtype: 'success', result: '', is_error: false });
    exitChild(child, 0);
    await session.awaitTurn();
    await session.close();
  });

  test('--session-id (fresh) when no resumeSessionId', async () => {
    const child = makeMockChild();
    let capturedArgs: string[] = [];
    const spawnImpl = vi.fn((_cmd: string, args: readonly string[]) => {
      capturedArgs = [...args];
      return child as unknown as ChildProcess;
    });
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 10,
    });
    await session.send('hello');
    expect(capturedArgs).toContain('--session-id');
    expect(capturedArgs).not.toContain('--resume');
    emitEvent(child, { type: 'result', subtype: 'success', result: '', is_error: false });
    exitChild(child, 0);
    await session.awaitTurn();
    await session.close();
  });

  test('spawnCwd used as process cwd when provided, cwd still used for --add-dir', async () => {
    const child = makeMockChild();
    let capturedArgs: string[] = [];
    let capturedSpawnCwd = '';
    const spawnImpl = vi.fn(
      (_cmd: string, args: readonly string[], opts: { cwd?: string } | undefined) => {
        capturedArgs = [...args];
        capturedSpawnCwd = opts?.cwd ?? '';
        return child as unknown as ChildProcess;
      },
    );
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const projectPath = '/fake/project';
    const neutralDir = '/tmp/neutral';
    const session = await adapter.startSession({
      cwd: projectPath,
      spawnCwd: neutralDir,
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 10,
    });
    await session.send('hi');
    // --add-dir should point to the project (value may be shell-quoted on Windows)
    const addDirIdx = capturedArgs.indexOf('--add-dir');
    expect(addDirIdx).toBeGreaterThanOrEqual(0);
    const rawAddDir = capturedArgs[addDirIdx + 1] ?? '';
    const unquotedAddDir = rawAddDir.startsWith('"') && rawAddDir.endsWith('"')
      ? rawAddDir.slice(1, -1)
      : rawAddDir;
    expect(unquotedAddDir).toBe(projectPath);
    // spawn cwd should be the neutral dir
    expect(capturedSpawnCwd).toBe(neutralDir);
    emitEvent(child, { type: 'result', subtype: 'success', result: '', is_error: false });
    exitChild(child, 0);
    await session.awaitTurn();
    await session.close();
  });

  test('--permission-mode flag uses config value when provided', async () => {
    const child = makeMockChild();
    let capturedArgs: string[] = [];
    const spawnImpl = vi.fn((_cmd: string, args: readonly string[]) => {
      capturedArgs = [...args];
      return child as unknown as ChildProcess;
    });
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 10,
      permissionMode: 'acceptEdits',
    });
    await session.send('hi');
    const pmIdx = capturedArgs.indexOf('--permission-mode');
    expect(pmIdx).toBeGreaterThanOrEqual(0);
    expect(capturedArgs[pmIdx + 1]).toBe('acceptEdits');
    emitEvent(child, { type: 'result', subtype: 'success', result: '', is_error: false });
    exitChild(child, 0);
    await session.awaitTurn();
    await session.close();
  });
});

describe('ClaudeCodeAdapter — translator mode', () => {
  test('multiline systemPrompt — writes to temp file and argv has --system-prompt-file pointing to it', async () => {
    const multilinePrompt = 'Line one of the system prompt.\nLine two.\nLine three: special chars & "quotes" and \\backslashes\\';

    const child = makeMockChild();
    let capturedArgs: string[] = [];
    const spawnImpl = vi.fn((_cmd: string, args: readonly string[]) => {
      capturedArgs = [...args];
      return child as unknown as ChildProcess;
    });

    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });

    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: multilinePrompt,
      mode: 'translator',
      idleTimeoutSec: 5,
    });

    await session.send('translate: hello');

    // argv must contain --system-prompt-file followed by a path (NOT --system-prompt)
    expect(capturedArgs).toContain('--system-prompt-file');
    expect(capturedArgs).not.toContain('--system-prompt');

    const fileIdx = capturedArgs.indexOf('--system-prompt-file');
    expect(fileIdx).toBeGreaterThanOrEqual(0);
    const filePath = capturedArgs[fileIdx + 1];
    expect(typeof filePath).toBe('string');
    expect(filePath!.length).toBeGreaterThan(0);

    // The file must exist and contain the original multiline prompt verbatim.
    const fileContent = await fsp.readFile(filePath!, 'utf8');
    expect(fileContent).toBe(multilinePrompt);

    // Drive process to exit so awaitTurn resolves.
    child.stdout.write(
      JSON.stringify({ type: 'result', subtype: 'success', result: 'hi', is_error: false }),
    );
    exitChild(child, 0);
    await session.awaitTurn();

    // After close(), the temp file must be removed.
    await session.close();
    await expect(fsp.access(filePath!)).rejects.toThrow();
  });

  test('uses single-shot json args; emits one agent message with the result text', async () => {
    const child = makeMockChild();
    let capturedArgs: string[] = [];
    const spawnImpl = vi.fn((_cmd: string, args: readonly string[]) => {
      capturedArgs = [...args];
      return child as unknown as ChildProcess;
    });

    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });

    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: 'You are a terse translator',
      mode: 'translator',
      idleTimeoutSec: 5,
    });

    const received: AgentMessage[] = [];
    session.onMessage((m) => received.push(m));

    await session.send('translate to en: privet');

    expect(capturedArgs).toContain('-p');
    expect(capturedArgs).toContain('--output-format');
    expect(capturedArgs).toContain('json');
    expect(capturedArgs).toContain('--tools');
    // Empty string for --tools value
    const ti = capturedArgs.indexOf('--tools');
    expect(capturedArgs[ti + 1]).toBe('');
    expect(capturedArgs).toContain('--no-session-persistence');
    // Must use --system-prompt-file, not --system-prompt, to survive Windows
    // cmd.exe shell-wrapping of multiline values.
    expect(capturedArgs).toContain('--system-prompt-file');
    expect(capturedArgs).not.toContain('--system-prompt');

    // Push a single-shot JSON object to stdout, then exit.
    child.stdout.write(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'hello',
        is_error: false,
      }),
    );
    exitChild(child, 0);

    await session.awaitTurn();

    const agentMsgs = received.filter((m) => m.role === 'agent');
    expect(agentMsgs.length).toBe(1);
    expect(agentMsgs[0]?.text).toBe('hello');

    await session.close();
  });
});

describe('ClaudeCodeAdapter — health', () => {
  test('returns ok:false when cliPath is null', async () => {
    const adapter = new ClaudeCodeAdapter({ cliPath: '' });
    const h = await adapter.health();
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.reason).toMatch(/not found/i);
  });
});

describe('ClaudeCodeAdapter — usage extraction', () => {
  test('session.usage reflects cost and token counts from result event', async () => {
    const child = makeMockChild();
    const spawnImpl = vi.fn(() => child as unknown as ChildProcess);
    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude.cmd',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });

    const session = await adapter.startSession({
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
      idleTimeoutSec: 10,
    });

    await session.send('go');

    emitEvent(child, {
      type: 'result',
      subtype: 'success',
      result: 'done',
      is_error: false,
      total_cost_usd: 0.05,
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    exitChild(child, 0);

    await session.awaitTurn();

    expect(session.usage).toEqual({
      cost: 0.05,
      tokens: { input: 10, output: 20 },
    });

    await session.close();
  });
});
