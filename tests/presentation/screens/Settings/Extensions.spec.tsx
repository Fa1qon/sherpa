// tests/presentation/screens/Settings/Extensions.spec.tsx
// Extension Framework Plan 05 Task 5 — Extension Manager UI tests.

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import en from '../../../../src/renderer/locales/en.json';
import { Extensions } from '../../../../src/presentation/screens/Settings/sections/Extensions';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

interface MockApi {
  list: ReturnType<typeof vi.fn>;
  enable: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
  installZip: ReturnType<typeof vi.fn>;
  uninstall: ReturnType<typeof vi.fn>;
  pickZip: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  setSettings: ReturnType<typeof vi.fn>;
  installDir: ReturnType<typeof vi.fn>;
}

let api: MockApi;

beforeEach(() => {
  api = {
    list: vi.fn().mockResolvedValue([]),
    enable: vi.fn().mockResolvedValue({ ok: true }),
    disable: vi.fn().mockResolvedValue({ ok: true }),
    installZip: vi.fn().mockResolvedValue({ ok: true, extensionId: 'com.test.x' }),
    uninstall: vi.fn().mockResolvedValue({ ok: true }),
    pickZip: vi.fn().mockResolvedValue('/path/to/ext.zip'),
    getSettings: vi.fn().mockResolvedValue({}),
    setSettings: vi.fn().mockResolvedValue({ ok: true }),
    installDir: vi.fn().mockResolvedValue({ ok: true }),
  };

  // @ts-expect-error — partial mock; only the surfaces the component uses.
  globalThis.window.sherpa = {
    extensions: api,
  };
});

function renderSection(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <Extensions />
    </I18nextProvider>,
  );
}

describe('Extension Manager UI', () => {
  test('renders heading + install button', async () => {
    renderSection();
    expect(
      await screen.findByRole('heading', { name: /Extensions/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Install from \.zip/i })).toBeInTheDocument();
  });

  test('shows empty state when no extensions are installed', async () => {
    renderSection();
    expect(
      await screen.findByText(/No extensions installed/i),
    ).toBeInTheDocument();
  });

  test('lists installed extensions with name / version / id', async () => {
    api.list.mockResolvedValue([
      {
        id: 'com.test.a',
        name: 'Alpha',
        version: '1.2.3',
        description: 'first ext',
        enabled: false,
        hasMain: true,
        hasRenderer: false,
      },
    ]);
    renderSection();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('com.test.a')).toBeInTheDocument();
    expect(screen.getByText('first ext')).toBeInTheDocument();
  });

  test('toggling checkbox calls enable then refreshes', async () => {
    api.list.mockResolvedValueOnce([
      {
        id: 'com.test.a',
        name: 'Alpha',
        version: '1.0.0',
        enabled: false,
        hasMain: true,
        hasRenderer: false,
      },
    ]);
    api.list.mockResolvedValueOnce([
      {
        id: 'com.test.a',
        name: 'Alpha',
        version: '1.0.0',
        enabled: true,
        hasMain: true,
        hasRenderer: false,
      },
    ]);
    const user = userEvent.setup();
    renderSection();
    const cb = await screen.findByRole('checkbox');
    await user.click(cb);
    await waitFor(() => expect(api.enable).toHaveBeenCalledWith('com.test.a'));
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  test('toggling off calls disable', async () => {
    api.list.mockResolvedValueOnce([
      {
        id: 'com.test.a',
        name: 'Alpha',
        version: '1.0.0',
        enabled: true,
        hasMain: true,
        hasRenderer: false,
      },
    ]);
    api.list.mockResolvedValueOnce([
      {
        id: 'com.test.a',
        name: 'Alpha',
        version: '1.0.0',
        enabled: false,
        hasMain: true,
        hasRenderer: false,
      },
    ]);
    const user = userEvent.setup();
    renderSection();
    const cb = await screen.findByRole('checkbox');
    await user.click(cb);
    await waitFor(() => expect(api.disable).toHaveBeenCalledWith('com.test.a'));
  });

  test('clicking Install opens picker; cancel is a no-op', async () => {
    api.pickZip.mockResolvedValue(null);
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('button', { name: /Install from \.zip/i }));
    expect(api.pickZip).toHaveBeenCalled();
    expect(api.installZip).not.toHaveBeenCalled();
  });

  test('successful install triggers list refresh', async () => {
    api.pickZip.mockResolvedValue('/some/file.zip');
    api.installZip.mockResolvedValue({ ok: true, extensionId: 'com.test.x' });
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('button', { name: /Install from \.zip/i }));
    await waitFor(() => expect(api.installZip).toHaveBeenCalledWith('/some/file.zip'));
    // initial list call + post-install reload
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  test('failed install surfaces the error message', async () => {
    api.pickZip.mockResolvedValue('/bad.zip');
    api.installZip.mockResolvedValue({
      ok: false,
      errors: ['Missing sherpa.extension.json'],
    });
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('button', { name: /Install from \.zip/i }));
    expect(
      await screen.findByText(/Missing sherpa\.extension\.json/i),
    ).toBeInTheDocument();
  });

  test('uninstall asks for confirmation; declining is a no-op', async () => {
    api.list.mockResolvedValueOnce([
      {
        id: 'com.test.a',
        name: 'Alpha',
        version: '1.0.0',
        enabled: false,
        hasMain: true,
        hasRenderer: false,
      },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderSection();
    const btn = await screen.findByRole('button', { name: /Uninstall/i });
    await user.click(btn);
    expect(confirmSpy).toHaveBeenCalled();
    expect(api.uninstall).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test('uninstall accepts confirmation and calls uninstall + refresh', async () => {
    api.list.mockResolvedValueOnce([
      {
        id: 'com.test.a',
        name: 'Alpha',
        version: '1.0.0',
        enabled: false,
        hasMain: true,
        hasRenderer: false,
      },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderSection();
    const btn = await screen.findByRole('button', { name: /Uninstall/i });
    await user.click(btn);
    await waitFor(() => expect(api.uninstall).toHaveBeenCalledWith('com.test.a'));
    expect(api.list).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });
});
