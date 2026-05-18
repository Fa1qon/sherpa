import { randomUUID } from 'node:crypto';
import { NdjsonAgentBase, type NdjsonAgentOptions } from '../_base/ndjson_agent_base';
import type { AgentMessage, AgentSessionConfig } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';

export class OpenCodeAdapter extends NdjsonAgentBase {
  readonly providerId = 'opencode';
  readonly binaryName = 'opencode';

  constructor(options: NdjsonAgentOptions = {}) {
    super(options);
  }

  buildArgs(config: AgentSessionConfig, text: string, _spFile: string): string[] {
    const args = ['run', '-m', text, '--format', 'json'];
    if (config.model) args.push('--model', config.model);
    if (config.resumeSessionId) args.push('--continue');
    return args;
  }

  handleLine(parsed: unknown, emit: (msg: AgentMessage) => void): void {
    if (typeof parsed !== 'object' || parsed === null) return;
    const p = parsed as Record<string, unknown>;
    if (Array.isArray(p.messages)) {
      for (const msg of p.messages as Array<Record<string, unknown>>) {
        if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
          emit({ id: randomUUID(), role: 'agent', text: msg.content, timestamp: new Date().toISOString() });
        }
      }
    }
  }

  extractSessionId(parsed: unknown): string | undefined {
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const p = parsed as Record<string, unknown>;
    if (typeof p.id === 'string' && (p.id as string).startsWith('ses_')) return p.id as string;
    return undefined;
  }

  buildCredentialEnv(_credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    return {};
  }
}
