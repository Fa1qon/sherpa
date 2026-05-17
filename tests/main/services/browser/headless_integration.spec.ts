// tests/main/services/browser/headless_integration.spec.ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest';

const RUN = process.env['SHERPA_BROWSER_INTEGRATION'] === '1';

describe.runIf(RUN)('HeadlessBackend integration (real Chromium)', () => {
  // Dynamic import to avoid loading playwright-core in unit test runs
  let HeadlessBackend: typeof import('../../../../src/main/services/browser/headless_backend').HeadlessBackend;
  let backend: InstanceType<typeof HeadlessBackend>;

  beforeAll(async () => {
    const mod = await import('../../../../src/main/services/browser/headless_backend');
    HeadlessBackend = mod.HeadlessBackend;
    backend = new HeadlessBackend('integration-test');
    await backend.init();
  }, 30_000);

  afterAll(async () => {
    await backend?.close();
  }, 10_000);

  test('navigates to example.com and gets DOM', async () => {
    await backend.navigate('https://example.com');
    const dom = await backend.getDOM();
    expect(dom).toContain('Example Domain');
  }, 15_000);

  test('screenshot returns a non-empty base64 PNG', async () => {
    const result = await backend.screenshot();
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  }, 10_000);

  test('evaluate returns JavaScript result', async () => {
    const title = await backend.evaluate<string>('document.title');
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  }, 10_000);

  test('events emitted on navigate', async () => {
    const events: unknown[] = [];
    const unsub = backend.onEvent((ev) => events.push(ev));
    await backend.navigate('https://example.com');
    await new Promise((r) => setTimeout(r, 500));
    unsub();
    expect(events.some((e) => (e as { type: string }).type === 'navigate')).toBe(true);
  }, 15_000);

  test('waitFor finds existing element', async () => {
    await backend.navigate('https://example.com');
    await expect(backend.waitFor('h1', 5000)).resolves.toBeUndefined();
  }, 15_000);
});
