import { describe, test, expect } from 'vitest';
import {
  isProxyEntry,
  isProxyAssignments,
  PROXY_TARGETS,
  DEFAULT_PROXY_ASSIGNMENTS,
  buildProxyUrl,
} from '../../../src/core/domain/proxy';

describe('proxy domain', () => {
  test('isProxyEntry accepts valid http entry', () => {
    expect(
      isProxyEntry({
        id: 'p1',
        name: 'Work',
        type: 'http',
        host: 'proxy.co',
        port: 8080,
      })
    ).toBe(true);
  });

  test('isProxyEntry rejects missing fields', () => {
    expect(
      isProxyEntry({
        id: 'p1',
        name: 'Work',
        type: 'http',
        host: 'proxy.co',
      })
    ).toBe(false);
  });

  test('isProxyAssignments accepts valid assignments', () => {
    expect(
      isProxyAssignments({
        claudeAgent: 'direct',
        userBrowser: 'direct',
        aiBrowser: 'direct',
        webSearch: 'direct',
      })
    ).toBe(true);
  });

  test('isProxyAssignments rejects missing target key', () => {
    expect(
      isProxyAssignments({
        claudeAgent: 'direct',
        userBrowser: 'direct',
        aiBrowser: 'direct',
        // webSearch missing
      })
    ).toBe(false);
  });

  test('isProxyAssignments rejects numeric value for target', () => {
    expect(
      isProxyAssignments({
        claudeAgent: 'direct',
        userBrowser: 123,
        aiBrowser: 'direct',
        webSearch: 'direct',
      })
    ).toBe(false);
  });

  test('isProxyAssignments rejects empty string value', () => {
    expect(
      isProxyAssignments({
        claudeAgent: '',
        userBrowser: 'direct',
        aiBrowser: 'direct',
        webSearch: 'direct',
      })
    ).toBe(false);
  });

  test('DEFAULT_PROXY_ASSIGNMENTS has all targets set to direct', () => {
    for (const t of PROXY_TARGETS) {
      expect(DEFAULT_PROXY_ASSIGNMENTS[t]).toBe('direct');
    }
  });

  test('buildProxyUrl constructs http url without auth', () => {
    expect(
      buildProxyUrl({
        id: 'p',
        name: 'p',
        type: 'http',
        host: 'proxy.co',
        port: 8080,
      })
    ).toBe('http://proxy.co:8080');
  });

  test('buildProxyUrl constructs socks5 url with auth', () => {
    expect(
      buildProxyUrl({
        id: 'p',
        name: 'p',
        type: 'socks5',
        host: '127.0.0.1',
        port: 1080,
        username: 'u',
        password: 'p@ss',
      })
    ).toBe('socks5://u:p%40ss@127.0.0.1:1080');
  });
});
