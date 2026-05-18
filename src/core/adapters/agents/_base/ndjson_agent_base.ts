import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentPort, AgentSession } from '../../../ports/agent_port';
import type { AgentMessage, AgentSessionConfig, AgentSessionId } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';

const IS_WINDOWS = process.platform === 'win32';
const DEFAULT_IDLE_TIMEOUT_SEC = 300;

export interface NdjsonAgentOptions {
  getCredential?: () => AgentCredential | undefined;
  getProxyEnv?: () => NodeJS.ProcessEnv;
}

export abstract class NdjsonAgentBase implements AgentPort {
  protected readonly options: NdjsonAgentOptions;

  constructor(options: NdjsonAgentOptions = {}) {
    this.options = options;
  }

  abstract readonly providerId: string;
  abstract readonly binaryName: string;

  abstract buildArgs(config: AgentSessionConfig, text: string, spFile: string): string[];
  abstract handleLine(parsed: unknown, emit: (msg: AgentMessage) => void): void;
  abstract extractSessionId(parsed: unknown): string | undefined;
  abstract buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv;

  protected useStdin(): boolean {
    return false;
  }

  resolveBinary(): string | null {
    const result = spawnSync(IS_WINDOWS ? 'where' : 'which', [this.binaryName], { encoding: 'utf8' });
    if (result.status !== 0) return null;
    return result.stdout.trim().split('\n')[0]?.trim() ?? null;
  }

  async health(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const bin = this.resolveBinary();
    if (!bin) return { ok: false, reason: `Binary not found: ${this.binaryName}` };
    return { ok: true };
  }

  async startSession(config: AgentSessionConfig): Promise<AgentSession> {
    const sessionId: AgentSessionId = { value: randomUUID() };
    const spFile = path.join(tmpdir(), `sherpa-sp-${randomUUID()}.txt`);
    await fsp.writeFile(spFile, config.systemPrompt ?? '', 'utf8');

    const subscribers: Array<(msg: AgentMessage) => void> = [];
    const emit = (msg: AgentMessage): void => {
      for (const sub of subscribers) {
        try { sub(msg); } catch { /* isolate subscriber errors */ }
      }
    };

    let returnedSessionId: string | undefined;
    let proc: ReturnType<typeof spawn> | undefined;
    let turnResolve: (() => void) | undefined;
    let turnReject: ((e: Error) => void) | undefined;
    let turnPromise: Promise<void> = Promise.resolve();

    const send = async (text: string): Promise<void> => {
      const args = this.buildArgs(config, text, spFile);
      const credential = this.options.getCredential?.();
      const proxyEnv = this.options.getProxyEnv?.() ?? {};
      const credEnv = this.buildCredentialEnv(credential);

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        FORCE_COLOR: '0',
        ...proxyEnv,
        ...credEnv,
      };

      const bin = this.resolveBinary() ?? this.binaryName;
      const idleSec = config.idleTimeoutSec ?? DEFAULT_IDLE_TIMEOUT_SEC;

      turnPromise = new Promise<void>((res, rej) => {
        turnResolve = res;
        turnReject = rej;
      });
      returnedSessionId = undefined;

      proc = spawn(bin, args, {
        env,
        cwd: config.spawnCwd ?? config.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      let idleTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
        proc?.kill('SIGTERM');
        turnReject?.(new Error(`Agent idle timeout after ${idleSec}s`));
      }, idleSec * 1000);

      const resetIdle = (): void => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          proc?.kill('SIGTERM');
          turnReject?.(new Error(`Agent idle timeout after ${idleSec}s`));
        }, idleSec * 1000);
      };

      let buf = '';

      proc.stdout!.on('data', (chunk: Buffer) => {
        resetIdle();
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed: unknown;
          try { parsed = JSON.parse(line); } catch { continue; }
          const sid = this.extractSessionId(parsed);
          if (sid) returnedSessionId = sid;
          this.handleLine(parsed, emit);
        }
      });

      proc.on('close', () => {
        clearTimeout(idleTimer);
        if (buf.trim()) {
          let parsed: unknown;
          try { parsed = JSON.parse(buf); } catch { parsed = null; }
          if (parsed !== null) {
            const sid = this.extractSessionId(parsed);
            if (sid) returnedSessionId = sid;
            this.handleLine(parsed, emit);
          }
        }
        void fsp.unlink(spFile).catch(() => {});
        turnResolve?.();
      });

      proc.on('error', (err) => {
        clearTimeout(idleTimer);
        void fsp.unlink(spFile).catch(() => {});
        turnReject?.(err);
      });

      if (this.useStdin()) {
        proc.stdin!.write(text + '\n');
      }
      proc.stdin!.end();
    };

    const session: AgentSession = {
      id: sessionId,
      send,
      onMessage(cb) {
        subscribers.push(cb);
        return () => {
          const i = subscribers.indexOf(cb);
          if (i >= 0) subscribers.splice(i, 1);
        };
      },
      awaitTurn: () => turnPromise,
      async close() {
        proc?.kill('SIGTERM');
        await fsp.unlink(spFile).catch(() => {});
      },
      get returnedSessionId() { return returnedSessionId; },
    };

    return session;
  }
}
