import { randomUUID } from 'node:crypto';
import { NdjsonAgentBase, type NdjsonAgentOptions } from '../_base/ndjson_agent_base';
import type { AgentMessage, AgentSessionConfig } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';

export interface PiAdapterOptions extends NdjsonAgentOptions {
  provider?: string;
}

export class PiAdapter extends NdjsonAgentBase {
  readonly providerId = 'pi';
  readonly binaryName = 'pi';
  private readonly provider: string;

  constructor(options: PiAdapterOptions = {}) {
    super(options);
    this.provider = options.provider ?? 'openai';
  }

  buildArgs(config: AgentSessionConfig, text: string, _spFile: string): string[] {
    const args = ['-p', text, '--mode', 'rpc'];
    if (config.resumeSessionId) args.push('--session', config.resumeSessionId);
    if (config.model) args.push('--model', config.model);
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
    if (typeof p.session_id === 'string') return p.session_id;
    return undefined;
  }

  buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    if (!credential || credential.type !== 'apikey' || !credential.apiKey) return {};
    const keyMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      groq: 'GROQ_API_KEY',
    };
    return { [keyMap[this.provider] ?? 'OPENAI_API_KEY']: credential.apiKey };
  }
}
