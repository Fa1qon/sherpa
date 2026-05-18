import { randomUUID } from 'node:crypto';
import { NdjsonAgentBase, type NdjsonAgentOptions } from '../_base/ndjson_agent_base';
import type { AgentMessage, AgentSessionConfig } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';

export class GooseAdapter extends NdjsonAgentBase {
  readonly providerId = 'goose';
  readonly binaryName = 'goose';

  constructor(options: NdjsonAgentOptions = {}) {
    super(options);
  }

  buildArgs(config: AgentSessionConfig, text: string, _spFile: string): string[] {
    const args = ['run', '-t', text, '--output-format', 'stream-json'];
    if (config.resumeSessionId) args.push('--resume', config.resumeSessionId);
    return args;
  }

  handleLine(parsed: unknown, emit: (msg: AgentMessage) => void): void {
    if (typeof parsed !== 'object' || parsed === null) return;
    const p = parsed as Record<string, unknown>;
    if (
      (p.type === 'Message' || p.type === 'message') &&
      (p.role === 'assistant' || p.role === 'goose')
    ) {
      const content = Array.isArray(p.content) ? p.content : [];
      const text = (content as Array<Record<string, unknown>>)
        .filter(c => c.type === 'text')
        .map(c => String(c.text ?? ''))
        .join('');
      if (text.trim()) {
        emit({ id: randomUUID(), role: 'agent', text, timestamp: new Date().toISOString() });
      }
    }
  }

  extractSessionId(parsed: unknown): string | undefined {
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const p = parsed as Record<string, unknown>;
    if (typeof p.session_id === 'string') return p.session_id;
    return undefined;
  }

  buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    if (!credential) return {};
    if (credential.type === 'apikey' && credential.apiKey) {
      if (credential.apiKey === 'ollama') return { GOOSE_PROVIDER: 'ollama' };
      return { GOOSE_PROVIDER_API_KEY: credential.apiKey };
    }
    return {};
  }
}
