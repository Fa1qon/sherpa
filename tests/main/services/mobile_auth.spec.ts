import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MobileAuth } from '../../../src/main/services/mobile_auth.js';

describe('MobileAuth', () => {
  let auth: MobileAuth;

  beforeEach(() => {
    auth = new MobileAuth('1234');
  });

  it('login with correct PIN returns a token and verify returns true', () => {
    const token = auth.login('1.1.1.1', '1234');
    expect(token).not.toBeNull();
    expect(typeof token).toBe('string');
    expect(auth.verify(token as string)).toBe(true);
  });

  it('login with wrong PIN returns null', () => {
    expect(auth.login('1.1.1.1', '9999')).toBeNull();
  });

  it('locks an IP after 10 failed attempts even if PIN becomes correct on 11th', () => {
    for (let i = 0; i < 10; i++) {
      expect(auth.login('2.2.2.2', '0000')).toBeNull();
    }
    expect(auth.login('2.2.2.2', '1234')).toBeNull();
  });

  it('successful login resets the failed-attempts counter for that IP', () => {
    for (let i = 0; i < 9; i++) {
      expect(auth.login('3.3.3.3', '0000')).toBeNull();
    }
    // Correct PIN on the 10th attempt succeeds and resets the counter
    const token = auth.login('3.3.3.3', '1234');
    expect(token).not.toBeNull();
    // Now we should be able to fail again without being locked immediately
    expect(auth.login('3.3.3.3', '0000')).toBeNull();
    // And a fresh correct login still works
    expect(auth.login('3.3.3.3', '1234')).not.toBeNull();
  });

  it('verify returns false for an unknown token', () => {
    expect(auth.verify('not-a-real-token')).toBe(false);
  });

  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('verify returns false for an expired token (past 24h)', () => {
      const token = auth.login('4.4.4.4', '1234') as string;
      expect(auth.verify(token)).toBe(true);
      // Advance past 24h TTL
      vi.setSystemTime(new Date('2026-01-02T00:00:01Z'));
      expect(auth.verify(token)).toBe(false);
      // Lazy removal: subsequent verify also returns false
      expect(auth.verify(token)).toBe(false);
    });
  });

  it('revoke removes the session so subsequent verify returns false', () => {
    const token = auth.login('5.5.5.5', '1234') as string;
    expect(auth.verify(token)).toBe(true);
    auth.revoke(token);
    expect(auth.verify(token)).toBe(false);
  });

  it('setPin with non-4-8-digit values throws', () => {
    expect(() => auth.setPin('123')).toThrow(/4-8 digits/);
    expect(() => auth.setPin('12345678 9')).toThrow(/4-8 digits/);
    expect(() => auth.setPin('abcd')).toThrow(/4-8 digits/);
    expect(() => auth.setPin('123456789')).toThrow(/4-8 digits/);
  });

  it('setPin with a valid new PIN clears existing sessions', () => {
    const oldToken = auth.login('6.6.6.6', '1234') as string;
    expect(auth.verify(oldToken)).toBe(true);
    auth.setPin('5678');
    expect(auth.verify(oldToken)).toBe(false);
    // Old PIN no longer works
    expect(auth.login('6.6.6.6', '1234')).toBeNull();
    // New PIN works
    expect(auth.login('6.6.6.6', '5678')).not.toBeNull();
  });

  it('revokeAll invalidates every active session', () => {
    const t1 = auth.login('7.7.7.7', '1234') as string;
    const t2 = auth.login('8.8.8.8', '1234') as string;
    expect(auth.verify(t1)).toBe(true);
    expect(auth.verify(t2)).toBe(true);
    auth.revokeAll();
    expect(auth.verify(t1)).toBe(false);
    expect(auth.verify(t2)).toBe(false);
  });
});
