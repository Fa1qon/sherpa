import { describe, test, expect, beforeEach } from 'vitest';
import { ProxyManager } from '../../../src/main/services/proxy_manager';
import type { ProxyEntry } from '../../../src/core/domain/proxy';

const WORK: ProxyEntry = { id: 'work', name: 'Work', type: 'http', host: 'proxy.co', port: 8080 };
const SOCKS: ProxyEntry = { id: 'socks', name: 'Socks', type: 'socks5', host: '127.0.0.1', port: 1080 };
const AUTH: ProxyEntry = { id: 'auth', name: 'Auth', type: 'http', host: 'p.co', port: 8080, username: 'u', password: 's' };

describe('ProxyManager', () => {
  let pm: ProxyManager;

  beforeEach(() => { pm = new ProxyManager(); });

  test('returns null for all targets when no config loaded', () => {
    expect(pm.getProxyUrl('claudeAgent')).toBeNull();
    expect(pm.getProxyUrl('userBrowser')).toBeNull();
  });

  test('returns null when target is assigned to direct', () => {
    pm.update([WORK], { claudeAgent: 'direct', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct' });
    expect(pm.getProxyUrl('claudeAgent')).toBeNull();
  });

  test('returns proxy url when target is assigned to known entry', () => {
    pm.update([WORK], { claudeAgent: 'work', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct' });
    expect(pm.getProxyUrl('claudeAgent')).toBe('http://proxy.co:8080');
  });

  test('returns null when assigned entry id does not exist', () => {
    pm.update([WORK], { claudeAgent: 'ghost', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct' });
    expect(pm.getProxyUrl('claudeAgent')).toBeNull();
  });

  test('returns correct url for socks5', () => {
    pm.update([SOCKS], { claudeAgent: 'socks', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct' });
    expect(pm.getProxyUrl('claudeAgent')).toBe('socks5://127.0.0.1:1080');
  });

  test('encodes credentials in url', () => {
    pm.update([AUTH], { claudeAgent: 'auth', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct' });
    expect(pm.getProxyUrl('claudeAgent')).toBe('http://u:s@p.co:8080');
  });

  test('getNoProxy returns undefined when entry has no noProxy', () => {
    pm.update([WORK], { claudeAgent: 'work', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct' });
    expect(pm.getNoProxy('claudeAgent')).toBeUndefined();
  });

  test('getNoProxy returns bypass list', () => {
    const e = { ...WORK, noProxy: 'localhost,127.0.0.1' };
    pm.update([e], { claudeAgent: 'work', userBrowser: 'direct', aiBrowser: 'direct', webSearch: 'direct' });
    expect(pm.getNoProxy('claudeAgent')).toBe('localhost,127.0.0.1');
  });
});
