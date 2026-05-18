import { randomUUID } from 'node:crypto';
import { NdjsonAgentBase, type NdjsonAgentOptions } from '../_base/ndjson_agent_base';
import type { AgentMessage, AgentSessionConfig } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';

export class CodexAdapter extends NdjsonAgentBase {
  readonly providerId = 'codex';
  readonly binaryName = 'codex';

  constructor(options: NdjsonAgentOptions = {}) {
    super(options);
  }

  buildArgs(config: AgentSessionConfig, text: string, _spFile: string): string[] {
    if (config.resumeSessionId) {
      return ['exec', 'resume', config.resumeSessionId, text, '--json', '--full-auto'];
    }
    return ['exec', text, '--json', '--full-auto'];
  }

  handleLine(parsed: unknown, emit: (msg: AgentMessage) => void): void {
    if (typeof parsed !== 'object' || parsed === null) return;
    const p = parsed as Record<string, unknown>;
    if (p.type === 'item.completed' && typeof p.item === 'object' && p.item !== null) {
      const item = p.item as Record<string, unknown>;
      if (item.type === 'message' && item.role === 'assistant') {
        const content = Array.isArray(item.content) ? item.content : [];
        const text = (content as Array<Record<string, unknown>>)
          .filter(c => c.type === 'output_text')
          .map(c => String(c.text ?? ''))
          .join('');
        if (text.trim()) {
          emit({ id: randomUUID(), role: 'agent', text, timestamp: new Date().toISOString() });
        }
      }
    }
  }

  extractSessionId(parsed: unknown): string | undefined {
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const p = parsed as Record<string, unknown>;
    if (p.type === 'session_summary' && typeof p.threadId === 'string') return p.threadId;
    return undefined;
  }

  buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    if (!credential) return {};
    if (credential.type === 'apikey' && credential.apiKey) return { OPENAI_API_KEY: credential.apiKey };
    return {};
  }
}
