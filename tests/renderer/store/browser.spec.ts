// tests/renderer/store/browser.spec.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

vi.mock('../../../src/renderer/ipc/browser_ipc', () => ({
  browserIpc: {
    open: vi.fn().mockResolvedValue({ ok: true, mode: 'headless' }),
    close: vi.fn().mockResolvedValue({ ok: true }),
    navigate: vi.fn().mockResolvedValue({ ok: true }),
    screenshot: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,X', width: 100, height: 100 }),
    onEvent: vi.fn().mockReturnValue(() => undefined),
  },
}));

import { useBrowserStore } from '../../../src/renderer/store/browser';

describe('useBrowserStore', () => {
  beforeEach(() => {
    useBrowserStore.getState().reset();
  });

  test('initial state: no active session', () => {
    expect(useBrowserStore.getState().activeSessions).toEqual({});
  });

  test('openSession sets session state', async () => {
    await act(async () => {
      await useBrowserStore.getState().openSession('task-1', 'headless');
    });
    const sessions = useBrowserStore.getState().activeSessions;
    expect(sessions['task-1']).toBeDefined();
    expect(sessions['task-1']!.mode).toBe('headless');
  });

  test('navigate updates url in session', async () => {
    await act(async () => {
      await useBrowserStore.getState().openSession('task-1', 'headless');
      await useBrowserStore.getState().navigate('task-1', 'https://example.com');
    });
    const session = useBrowserStore.getState().activeSessions['task-1'];
    expect(session?.url).toBe('https://example.com');
  });

  test('closeSession removes session', async () => {
    await act(async () => {
      await useBrowserStore.getState().openSession('task-1', 'headless');
      await useBrowserStore.getState().closeSession('task-1');
    });
    expect(useBrowserStore.getState().activeSessions['task-1']).toBeUndefined();
  });

  test('navigate resets loading on error', async () => {
    const { browserIpc } = await import('../../../src/renderer/ipc/browser_ipc');
    (browserIpc.navigate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nav failed'));

    await act(async () => {
      await useBrowserStore.getState().openSession('task-1', 'headless');
      await useBrowserStore.getState().navigate('task-1', 'https://fail.example').catch(() => undefined);
    });

    const session = useBrowserStore.getState().activeSessions['task-1'];
    expect(session?.loading).toBe(false);
  });
});
