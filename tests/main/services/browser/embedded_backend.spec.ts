// tests/main/services/browser/embedded_backend.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockWebContents = {
  loadURL: vi.fn().mockResolvedValue(undefined),
  capturePage: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,ABC', getSize: () => ({ width: 1280, height: 720 }) }),
  executeJavaScript: vi.fn().mockResolvedValue('result'),
  getURL: vi.fn().mockReturnValue('https://example.com'),
  on: vi.fn(),
  once: vi.fn(),
};
const mockWebContentsView = {
  webContents: mockWebContents,
  setBounds: vi.fn(),
};
const mockBrowserWindow = {
  contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 1200, height: 800 }),
  on: vi.fn(),
};

vi.mock('electron', () => ({
  WebContentsView: vi.fn(function () { return mockWebContentsView; }),
}));

import { EmbeddedBackend } from '../../../../src/main/services/browser/embedded_backend';

describe('EmbeddedBackend', () => {
  let backend: EmbeddedBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new EmbeddedBackend('session-1', mockBrowserWindow as never);
  });

  test('navigate calls loadURL', async () => {
    backend.init();
    await backend.navigate('https://example.com');
    expect(mockWebContents.loadURL).toHaveBeenCalledWith('https://example.com');
  });

  test('screenshot returns dataUrl', async () => {
    backend.init();
    const result = await backend.screenshot();
    expect(result.dataUrl).toBe('data:image/png;base64,ABC');
    expect(result.width).toBe(1280);
  });

  test('evaluate delegates to executeJavaScript', async () => {
    backend.init();
    const result = await backend.evaluate<string>('1+1');
    expect(result).toBe('result');
    expect(mockWebContents.executeJavaScript).toHaveBeenCalledWith('1+1');
  });

  test('close removes child view', async () => {
    backend.init();
    await backend.close();
    expect(mockBrowserWindow.contentView.removeChildView).toHaveBeenCalledWith(mockWebContentsView);
  });
});
