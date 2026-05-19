import { describe, test, expect, beforeEach, vi } from 'vitest';
import { networkInterfaces } from 'node:os';
import { detectLanIp } from '../../../src/main/services/lan_ip';

vi.mock('node:os', () => ({ networkInterfaces: vi.fn() }));

const ipv4 = (
  address: string,
  internal: boolean,
): {
  address: string;
  netmask: string;
  family: 'IPv4';
  mac: string;
  internal: boolean;
  cidr: string | null;
} => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/24`,
});

const ipv6 = (
  address: string,
  internal: boolean,
): {
  address: string;
  netmask: string;
  family: 'IPv6';
  mac: string;
  internal: boolean;
  cidr: string | null;
  scopeid: number;
} => ({
  address,
  netmask: 'ffff:ffff:ffff:ffff::',
  family: 'IPv6',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/64`,
  scopeid: 0,
});

describe('detectLanIp', () => {
  beforeEach(() => {
    vi.mocked(networkInterfaces).mockReset();
  });

  test('returns first non-loopback, non-link-local IPv4 address', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      lo: [ipv4('127.0.0.1', true)],
      eth0: [ipv4('192.168.1.42', false)],
    });
    expect(detectLanIp()).toBe('192.168.1.42');
  });

  test('skips internal (loopback) IPv4 addresses', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      lo: [ipv4('127.0.0.1', true)],
      wlan0: [ipv4('10.0.0.5', false)],
    });
    expect(detectLanIp()).toBe('10.0.0.5');
  });

  test('skips link-local 169.254.* IPv4 addresses', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      eth0: [ipv4('169.254.10.20', false)],
      eth1: [ipv4('192.168.0.100', false)],
    });
    expect(detectLanIp()).toBe('192.168.0.100');
  });

  test('returns 127.0.0.1 fallback when no usable IPv4 interface is found', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      lo: [ipv4('127.0.0.1', true)],
      eth0: [ipv4('169.254.1.1', false), ipv6('fe80::1', false)],
    });
    expect(detectLanIp()).toBe('127.0.0.1');
  });

  test('returns 127.0.0.1 when networkInterfaces() returns {}', () => {
    vi.mocked(networkInterfaces).mockReturnValue({});
    expect(detectLanIp()).toBe('127.0.0.1');
  });
});
