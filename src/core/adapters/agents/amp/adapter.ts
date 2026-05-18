import { randomUUID } from 'node:crypto';
import { NdjsonAgentBase, type NdjsonAgentOptions } from '../_base/ndjson_agent_base';
import type { AgentMessage, AgentSessionConfig } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';

export class AmpAdapter extends NdjsonAgentBase {
  readonly providerId = 'amp';
  readonly binaryName = 'amp';

  constructor(options: NdjsonAgentOptions = {}) {
    super(options);
  }

  buildArgs(config: AgentSessionConfig, text: string, _spFile: string): string[] {
    const args = ['-x', text, '--stream-json'];
    if (config.resumeSessionId) args.push('--thread', config.resumeSessionId);
    return args;
  }

  handleLine(parsed: unknown, emit: (msg: AgentMessage) => void): void {
    if (typeof parsed !== 'object' || parsed === null) return;
    const p = parsed as Record<string, unknown>;
    if (p.type === 'message' && p.role === 'assistant') {
      let text = '';
      if (typeof p.content === 'string') {
        text = p.content;
      } else if (Array.isArray(p.content)) {
        text = (p.content as Array<Record<string, unknown>>)
          .filter(c => c.type === 'text')
          .map(c => String(c.text ?? ''))
          .join('');
      }
      if (text.trim()) {
        emit({ id: randomUUID(), role: 'agent', text, timestamp: new Date().toISOString() });
      }
    }
  }

  extractSessionId(parsed: unknown): string | undefined {
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const p = parsed as Record<string, unknown>;
    if (typeof p.threadId === 'string') return p.threadId;
    return undefined;
  }

  buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    if (!credential) return {};
    if (credential.type === 'apikey' && credential.apiKey) return { AMP_API_KEY: credential.apiKey };
    if (credential.type === 'oauth' && credential.accessToken) return { AMP_API_KEY: credential.accessToken };
    return {};
  }
}
