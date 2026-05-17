import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { ProjectPicker } from '../../../src/presentation/screens/ProjectPicker';
import { useProject } from '../../../src/renderer/store/project';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {
      listRecent: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      open: vi.fn(),
      removeFromRecent: vi.fn(),
      pickFolder: vi.fn().mockResolvedValue(null),
    },
    settings: {} as never,
  };
  useProject.setState({
    current: null,
    recent: [],
    busy: false,
    error: null,
  });
});

describe('ProjectPicker', () => {
  test('renders title + add button + empty recent message', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectPicker />
      </I18nextProvider>,
    );
    expect(screen.getByText('Open a Sherpa project')).toBeInTheDocument();
    expect(screen.getByText('Add project (folder…)')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('No recent projects yet.')).toBeInTheDocument();
    });
  });

  test('shows recent list when populated', async () => {
    useProject.setState({
      recent: [{ id: 'a', name: 'p', path: '/p' }],
    });
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectPicker />
      </I18nextProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('p')).toBeInTheDocument();
      expect(screen.getByText('/p')).toBeInTheDocument();
    });
  });

  test('clicking add calls pickFolder', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectPicker />
      </I18nextProvider>,
    );
    // Wait for refreshRecent to settle (busy → false, button enabled).
    await waitFor(() => {
      expect(screen.getByText('Add project (folder…)')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText('Add project (folder…)'));
    await waitFor(() => {
      expect(window.sherpa.project.pickFolder).toHaveBeenCalled();
    });
  });

  test('shows scaffold prompt when sherpa-missing error', async () => {
    (window.sherpa.project.pickFolder as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/some/path');
    (window.sherpa.project.add as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: { kind: 'sherpa-missing-and-no-scaffold' },
    });
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectPicker />
      </I18nextProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Add project (folder…)')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText('Add project (folder…)'));
    await waitFor(() => {
      expect(screen.getByText(/No \.sherpa\/ folder/)).toBeInTheDocument();
    });
  });
});
