import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/main/services/browser/headless_backend', () => {
  class MockHeadlessBackend {
    init = vi.fn().mockResolvedValue(undefined);
    navigate = vi.fn().mockResolvedValue(undefined);
    screenshot = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,X', width: 100, height: 100 });
    close = vi.fn().mockResolvedValue(undefined);
    onEvent = vi.fn().mockReturnValue(() => undefined);
    evaluate = vi.fn().mockResolvedValue(null);
    getDOM = vi.fn().mockResolvedValue('<html/>');
    click = vi.fn().mockResolvedValue(undefined);
    type = vi.fn().mockResolvedValue(undefined);
    waitFor = vi.fn().mockResolvedValue(undefined);
    highlight = vi.fn().mockResolvedValue(undefined);
  }
  return { HeadlessBackend: MockHeadlessBackend };
});

vi.mock('../../../src/main/services/browser/embedded_backend', () => {
  class MockEmbeddedBackend {
    init = vi.fn();
    navigate = vi.fn().mockResolvedValue(undefined);
    screenshot = vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,X', width: 100, height: 100 });
    close = vi.fn().mockResolvedValue(undefined);
    onEvent = vi.fn().mockReturnValue(() => undefined);
    evaluate = vi.fn().mockResolvedValue(null);
    getDOM = vi.fn().mockResolvedValue('<html/>');
    click = vi.fn().mockResolvedValue(undefined);
    type = vi.fn().mockResolvedValue(undefined);
    waitFor = vi.fn().mockResolvedValue(undefined);
    highlight = vi.fn().mockResolvedValue(undefined);
  }
  return { EmbeddedBackend: MockEmbeddedBackend };
});

import { BrowserService } from '../../../src/main/services/browser_service';

describe('BrowserService', () => {
  let service: BrowserService;

  beforeEach(() => {
    service = new BrowserService();
  });

  test('creates headless session', async () => {
    const session = await service.createSession('task-1', 'headless', null);
    expect(session.sessionId).toBe('task-1');
    expect(session.mode).toBe('headless');
  });

  test('creates embedded session', async () => {
    const session = await service.createSession('task-2', 'embedded', {} as never);
    expect(session.sessionId).toBe('task-2');
    expect(session.mode).toBe('embedded');
  });

  test('getSession returns existing session', async () => {
    await service.createSession('task-1', 'headless', null);
    const session = service.getSession('task-1');
    expect(session).toBeDefined();
    expect(session!.sessionId).toBe('task-1');
  });

  test('closeSession removes session', async () => {
    await service.createSession('task-1', 'headless', null);
    await service.closeSession('task-1');
    expect(service.getSession('task-1')).toBeUndefined();
  });
});
