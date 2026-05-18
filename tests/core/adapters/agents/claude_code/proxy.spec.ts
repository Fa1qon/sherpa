// Tests that ClaudeCodeAdapter injects proxy env vars into the spawned process
// when getProxyEnv is supplied via ClaudeCodeAdapterOptions.
//
// Strategy: inject a fake spawnImpl and capture the SpawnOptions.env passed
// to it. This avoids any real claude binary and is fully synchronous.

import { describe, test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { ClaudeCodeAdapter } from '../../../../../src/core/adapters/agents/claude_code/adapter';
import type { AgentSessionConfig } from '../../../../../src/core/domain/agent';

/* ------------------------------------------------------------------ */
/* Minimal mock ChildProcess                                            */
/* ------------------------------------------------------------------ */

function makeMockChild() {
  const ee = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    exitCode: number | null;
  };
  ee.stdout = new PassThrough();
  ee.stderr = new PassThrough();
  ee.stdin = new PassThrough();
  ee.exitCode = null;
  ee.kill = vi.fn(() => true);
  return ee;
}

/** Drain a mock child immediately so send() resolves/rejects cleanly. */
function drainChild(child: ReturnType<typeof makeMockChild>): void {
  child.exitCode = 0;
  child.stdout.end();
  child.stderr.end();
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
}

/* ------------------------------------------------------------------ */
/* Tests                                                                */
/* ------------------------------------------------------------------ */

describe('ClaudeCodeAdapter — proxy env injection', () => {
  test('spawn env includes proxy vars when getProxyEnv is provided', async () => {
    const child = makeMockChild();
    let capturedEnv: NodeJS.ProcessEnv | undefined;

    const spawnImpl = vi.fn(
      (_cmd: string, _args: readonly string[], opts: { env?: NodeJS.ProcessEnv }) => {
        capturedEnv = opts.env;
        return child as unknown as ChildProcess;
      },
    );

    const proxyVars = {
      HTTP_PROXY: 'http://proxy.co:8080',
      HTTPS_PROXY: 'http://proxy.co:8080',
      ALL_PROXY: 'http://proxy.co:8080',
      http_proxy: 'http://proxy.co:8080',
      https_proxy: 'http://proxy.co:8080',
      all_proxy: 'http://proxy.co:8080',
      NO_PROXY: 'localhost',
      no_proxy: 'localhost',
    };

    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      getProxyEnv: () => proxyVars,
    });

    const config: AgentSessionConfig = {
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
    };

    const session = await adapter.startSession(config);

    // Kick off send() — we don't need to await the turn; we only need spawn
    // to have been called to capture the env.
    const sendPromise = session.send('hello');

    // Drain — let the process exit immediately so send resolves cleanly.
    drainChild(child);

    await sendPromise.catch(() => {
      // worker mode rejects if no result event emitted before exit — that's
      // fine, we only care that spawn was called with the right env.
    });

    expect(spawnImpl).toHaveBeenCalledOnce();
    expect(capturedEnv).toBeDefined();
    expect(capturedEnv!['HTTP_PROXY']).toBe('http://proxy.co:8080');
    expect(capturedEnv!['HTTPS_PROXY']).toBe('http://proxy.co:8080');
    expect(capturedEnv!['ALL_PROXY']).toBe('http://proxy.co:8080');
    expect(capturedEnv!['http_proxy']).toBe('http://proxy.co:8080');
    expect(capturedEnv!['https_proxy']).toBe('http://proxy.co:8080');
    expect(capturedEnv!['all_proxy']).toBe('http://proxy.co:8080');
    expect(capturedEnv!['NO_PROXY']).toBe('localhost');
    expect(capturedEnv!['no_proxy']).toBe('localhost');
    // FORCE_COLOR must still be present (existing behaviour preserved).
    expect(capturedEnv!['FORCE_COLOR']).toBe('0');

    await session.close();
  });

  test('spawn env has no proxy vars when getProxyEnv is omitted', async () => {
    const child = makeMockChild();
    let capturedEnv: NodeJS.ProcessEnv | undefined;

    const spawnImpl = vi.fn(
      (_cmd: string, _args: readonly string[], opts: { env?: NodeJS.ProcessEnv }) => {
        capturedEnv = opts.env;
        return child as unknown as ChildProcess;
      },
    );

    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      // no getProxyEnv
    });

    const config: AgentSessionConfig = {
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
    };

    const session = await adapter.startSession(config);
    const sendPromise = session.send('hello');

    drainChild(child);

    await sendPromise.catch(() => { /* expected — no result event */ });

    expect(capturedEnv!['HTTP_PROXY']).toBeUndefined();
    expect(capturedEnv!['HTTPS_PROXY']).toBeUndefined();
    expect(capturedEnv!['NO_PROXY']).toBeUndefined();
    // FORCE_COLOR still set.
    expect(capturedEnv!['FORCE_COLOR']).toBe('0');

    await session.close();
  });

  test('ClaudeCodeAdapter picks up proxy changes between spawns', async () => {
    // This test verifies the live-update guarantee: changing the value returned
    // by getProxyEnv is reflected in the very next spawn without adapter recreation.
    let currentProxyUrl: string | null = 'http://proxy1.co:8080';

    const capturedEnvs: Array<NodeJS.ProcessEnv> = [];
    const children: Array<ReturnType<typeof makeMockChild>> = [];

    const spawnImpl = vi.fn(
      (_cmd: string, _args: readonly string[], opts: { env?: NodeJS.ProcessEnv }) => {
        capturedEnvs.push(opts.env ?? {});
        const child = makeMockChild();
        children.push(child);
        return child as unknown as ChildProcess;
      },
    );

    const adapter = new ClaudeCodeAdapter({
      cliPath: '/fake/claude',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      getProxyEnv: (): Readonly<Record<string, string>> => {
        if (!currentProxyUrl) return {};
        return {
          HTTP_PROXY: currentProxyUrl,
          HTTPS_PROXY: currentProxyUrl,
        };
      },
    });

    const config: AgentSessionConfig = {
      cwd: process.cwd(),
      systemPrompt: '',
      mode: 'worker',
    };

    // Helper: start a send(), wait for the async buildWorkerArgs to complete
    // and for spawnImpl to be called, then drain the child and await the turn.
    // send() is async: it awaits buildWorkerArgs (which writes a tmp file)
    // before calling spawnImpl, so we must await a few microtasks first.
    async function sendAndDrain(
      session: Awaited<ReturnType<typeof adapter.startSession>>,
      msg: string,
    ): Promise<void> {
      const sendPromise = session.send(msg);
      // Poll until spawnImpl fires and a child is in the array.
      const expectedIdx = capturedEnvs.length; // index this turn will occupy
      // Wait until the child for this turn has been created.
      await new Promise<void>((resolve) => {
        const id = setInterval(() => {
          if (children.length > expectedIdx) {
            clearInterval(id);
            resolve();
          }
        }, 1);
      });
      drainChild(children[expectedIdx]!);
      await sendPromise.catch(() => { /* no result event — expected */ });
    }

    // --- First session: proxy1 ---
    const session1 = await adapter.startSession(config);
    await sendAndDrain(session1, 'first turn');

    expect(capturedEnvs[0]?.['HTTP_PROXY']).toBe('http://proxy1.co:8080');
    expect(capturedEnvs[0]?.['HTTPS_PROXY']).toBe('http://proxy1.co:8080');
    await session1.close();

    // --- Mutate the proxy URL (simulates user changing proxy settings) ---
    currentProxyUrl = 'http://proxy2.co:9090';

    // --- Second session: proxy2 (same adapter instance) ---
    const session2 = await adapter.startSession(config);
    await sendAndDrain(session2, 'second turn');

    expect(capturedEnvs[1]?.['HTTP_PROXY']).toBe('http://proxy2.co:9090');
    expect(capturedEnvs[1]?.['HTTPS_PROXY']).toBe('http://proxy2.co:9090');
    await session2.close();

    // --- Disable proxy entirely ---
    currentProxyUrl = null;

    const session3 = await adapter.startSession(config);
    await sendAndDrain(session3, 'third turn');

    expect(capturedEnvs[2]?.['HTTP_PROXY']).toBeUndefined();
    expect(capturedEnvs[2]?.['HTTPS_PROXY']).toBeUndefined();
    // FORCE_COLOR must always be present.
    expect(capturedEnvs[2]?.['FORCE_COLOR']).toBe('0');
    await session3.close();
  });
});
