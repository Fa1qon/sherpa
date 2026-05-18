import type { AgentPort } from '../../core/ports/agent_port';
import type { AgentCli } from '../../core/domain/settings';

export class AgentRegistry {
  private readonly adapters = new Map<AgentCli, AgentPort>();

  register(cli: AgentCli, adapter: AgentPort): void {
    this.adapters.set(cli, adapter);
  }

  resolve(cli: AgentCli): AgentPort {
    const adapter = this.adapters.get(cli);
    if (!adapter) throw new Error(`Agent not registered: ${cli}`);
    return adapter;
  }

  async health(cli: AgentCli): Promise<{ ok: true } | { ok: false; reason: string }> {
    const adapter = this.adapters.get(cli);
    if (!adapter) return { ok: false, reason: `Agent not registered: ${cli}` };
    return adapter.health();
  }

  listRegistered(): AgentCli[] {
    return [...this.adapters.keys()];
  }
}

export const agentRegistry = new AgentRegistry();
