import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AgentPort, AgentSession } from '../../../ports/agent_port';
import type { AgentMessage, AgentSessionConfig, AgentSessionId } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';
import type { NdjsonAgentOptions } from './ndjson_agent_base';

const IS_WINDOWS = process.platform === 'win32';

export abstract class PlainTextAgentBase implements AgentPort {
  protected readonly options: NdjsonAgentOptions;

  constructor(options: NdjsonAgentOptions = {}) {
    this.options = options;
  }

  abstract readonly providerId: string;
  abstract readonly binaryName: string;

  abstract buildArgs(config: AgentSessionConfig, text: string): string[];
  abstract buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv;

  resolveBinary(): string | null {
    const r = spawnSync(IS_WINDOWS ? 'where' : 'which', [this.binaryName], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    return r.stdout.trim().split('\n')[0]?.trim() ?? null;
  }

  async health(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const bin = this.resolveBinary();
    if (!bin) return { ok: false, reason: `Binary not found: ${this.binaryName}` };
    return { ok: true };
  }

  async startSession(config: AgentSessionConfig): Promise<AgentSession> {
    const sessionId: AgentSessionId = { value: randomUUID() };
    const subscribers: Array<(msg: AgentMessage) => void> = [];

    const emit = (msg: AgentMessage): void => {
      for (const sub of subscribers) {
        try { sub(msg); } catch { /* isolate */ }
      }
    };

    let proc: ReturnType<typeof spawn> | undefined;
    let turnResolve: (() => void) | undefined;
    let turnReject: ((e: Error) => void) | undefined;
    let turnPromise: Promise<void> = Promise.resolve();

    const send = async (text: string): Promise<void> => {
      const args = this.buildArgs(config, text);
      const credential = this.options.getCredential?.();
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        FORCE_COLOR: '0',
        ...(this.options.getProxyEnv?.() ?? {}),
        ...this.buildCredentialEnv(credential),
      };

      const bin = this.resolveBinary() ?? this.binaryName;

      turnPromise = new Promise<void>((res, rej) => {
        turnResolve = res;
        turnReject = rej;
      });

      proc = spawn(bin, args, {
        env,
        cwd: config.spawnCwd ?? config.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      proc.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      proc.on('close', () => {
        if (stdout.trim()) {
          emit({
            id: randomUUID(),
            role: 'agent',
            text: stdout.trim(),
            timestamp: new Date().toISOString(),
          });
        }
        turnResolve?.();
      });
      proc.on('error', (err) => turnReject?.(err));
      proc.stdin!.end();
    };

    return {
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
      async close() { proc?.kill('SIGTERM'); },
      get returnedSessionId() { return undefined; },
    };
  }
}
