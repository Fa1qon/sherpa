export type ProxyType = 'http' | 'https' | 'socks5';

export type ProxyTarget = 'claudeAgent' | 'userBrowser' | 'aiBrowser' | 'webSearch';

export const PROXY_TARGETS: readonly ProxyTarget[] = [
  'claudeAgent',
  'userBrowser',
  'aiBrowser',
  'webSearch',
];

export interface ProxyEntry {
  readonly id: string;
  readonly name: string;
  readonly type: ProxyType;
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  /** Comma-separated hostnames/CIDRs that bypass the proxy. */
  readonly noProxy?: string;
}

/** Maps each traffic target to a proxy entry ID or 'direct'. */
export type ProxyAssignments = Record<ProxyTarget, string | 'direct'>;

export const DEFAULT_PROXY_ASSIGNMENTS: ProxyAssignments = {
  claudeAgent: 'direct',
  userBrowser: 'direct',
  aiBrowser: 'direct',
  webSearch: 'direct',
};

export function isProxyEntry(v: unknown): v is ProxyEntry {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' && (o.id as string).length > 0 &&
    typeof o.name === 'string' && (o.name as string).length > 0 &&
    (o.type === 'http' || o.type === 'https' || o.type === 'socks5') &&
    typeof o.host === 'string' && (o.host as string).length > 0 &&
    Number.isInteger(o.port) && (o.port as number) >= 1 && (o.port as number) <= 65535 &&
    (o.username === undefined || typeof o.username === 'string') &&
    (o.password === undefined || typeof o.password === 'string') &&
    (o.noProxy === undefined || typeof o.noProxy === 'string')
  );
}

export function isProxyAssignments(v: unknown): v is ProxyAssignments {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return PROXY_TARGETS.every(
    (t) => typeof o[t] === 'string' && (o[t] as string).length > 0,
  );
}

/**
 * Builds the proxy URL string for a given entry.
 * Format: `scheme://[user:pass@]host:port`
 * @param entry.host - Hostname or IPv4 address. IPv6 literals must be pre-wrapped in brackets (e.g. [::1]).
 */
export function buildProxyUrl(entry: ProxyEntry): string {
  const auth =
    entry.username
      ? `${encodeURIComponent(entry.username)}${entry.password ? `:${encodeURIComponent(entry.password)}` : ''}@`
      : '';
  return `${entry.type}://${auth}${entry.host}:${entry.port}`;
}
