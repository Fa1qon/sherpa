import type { ProxyEntry, ProxyAssignments, ProxyTarget } from '../../core/domain/proxy';
import { buildProxyUrl, DEFAULT_PROXY_ASSIGNMENTS } from '../../core/domain/proxy';

export class ProxyManager {
  private entries: readonly ProxyEntry[] = [];
  private assignments: ProxyAssignments = { ...DEFAULT_PROXY_ASSIGNMENTS };

  update(entries: readonly ProxyEntry[], assignments: ProxyAssignments): void {
    this.entries = entries;
    this.assignments = assignments;
  }

  /** Returns the proxy URL for the given target, or null if direct/unconfigured. */
  getProxyUrl(target: ProxyTarget): string | null {
    const assignedId = this.assignments[target];
    if (!assignedId || assignedId === 'direct') return null;
    const entry = this.entries.find((e) => e.id === assignedId);
    if (!entry) return null;
    return buildProxyUrl(entry);
  }

  /** Returns the no-proxy bypass list for a target's assigned entry. */
  getNoProxy(target: ProxyTarget): string | undefined {
    const assignedId = this.assignments[target];
    if (!assignedId || assignedId === 'direct') return undefined;
    const entry = this.entries.find((e) => e.id === assignedId);
    return entry?.noProxy;
  }
}

export const proxyManager = new ProxyManager();
