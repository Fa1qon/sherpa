import { PlainTextAgentBase } from '../_base/plain_text_agent_base';
import type { NdjsonAgentOptions } from '../_base/ndjson_agent_base';
import type { AgentSessionConfig } from '../../../domain/agent';
import type { AgentCredential } from '../../../domain/settings';

export interface AiderAdapterOptions extends NdjsonAgentOptions {
  provider?: string;
}

export class AiderAdapter extends PlainTextAgentBase {
  readonly providerId = 'aider';
  readonly binaryName = 'aider';
  private readonly provider: string;

  constructor(options: AiderAdapterOptions = {}) {
    super(options);
    this.provider = options.provider ?? 'openai';
  }

  buildArgs(config: AgentSessionConfig, text: string): string[] {
    const args = ['--message', text, '--yes', '--no-pretty', '--no-stream', '--no-fancy-input'];
    if (config.model) args.push('--model', config.model);
    return args;
  }

  buildCredentialEnv(credential: AgentCredential | undefined): NodeJS.ProcessEnv {
    if (this.provider === 'ollama') return { OLLAMA_API_BASE: 'http://localhost:11434' };
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
