// Unit tests for the typed DI Container (T-L1-05).
//
// Covers AC-T-L1-05-1: register + resolve roundtrip plus the
// surrounding contract (missing-token throw, duplicate-register throw,
// has() presence check). No third-party deps beyond vitest.

import { describe, test, expect } from 'vitest';
import { Container, token } from '../../src/main/container';

describe('Container', () => {
  test('register + resolve roundtrip returns the same instance', () => {
    const c = new Container();
    interface Foo {
      bar: number;
    }
    const fooToken = token<Foo>('Foo');
    const instance: Foo = { bar: 42 };

    c.register(fooToken, instance);

    expect(c.resolve(fooToken)).toBe(instance);
    expect(c.resolve(fooToken).bar).toBe(42);
  });

  test('resolve throws on missing token', () => {
    const c = new Container();
    const missing = token<string>('Missing');
    expect(() => c.resolve(missing)).toThrow(/not registered/);
  });

  test('register throws on duplicate token', () => {
    const c = new Container();
    const tk = token<number>('Dup');
    c.register(tk, 1);
    expect(() => c.register(tk, 2)).toThrow(/already registered/);
  });

  test('has() reports presence accurately', () => {
    const c = new Container();
    const tk = token<string>('S');
    expect(c.has(tk)).toBe(false);
    c.register(tk, 'x');
    expect(c.has(tk)).toBe(true);
  });

  test('distinct tokens with the same description are independent', () => {
    const c = new Container();
    const a = token<number>('Same');
    const b = token<number>('Same');
    c.register(a, 1);
    c.register(b, 2);
    expect(c.resolve(a)).toBe(1);
    expect(c.resolve(b)).toBe(2);
  });

  test('empty container construction is a no-op (no errors)', () => {
    expect(() => new Container()).not.toThrow();
  });
});
