import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { FilesPanel } from '../../../src/presentation/sidebar/FilesPanel';
import { useProject } from '../../../src/renderer/store/project';
import { useFiles } from '../../../src/renderer/store/files';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

beforeEach(() => {
  useProject.setState({ current: null, recent: [], busy: false, error: null });
  useFiles.setState({
    projectPath: null,
    tree: new Map(),
    expanded: new Set(['']),
    errors: new Map(),
  });
  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never,
    settings: {} as never,
    methodology: {} as never,
    shell: {} as never,
    task: {} as never,
    files: {
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(''),
    },
  };
});

describe('FilesPanel', () => {
  test('shows "open a project" hint when no project', () => {
    renderWithI18n(<FilesPanel />);
    expect(screen.getByText('Open a project to browse files.')).toBeInTheDocument();
  });

  test('renders file nodes when project + readDir returns entries', async () => {
    const entries = [
      { name: 'src', relPath: 'src', kind: 'directory' as const },
      { name: 'a.ts', relPath: 'a.ts', kind: 'file' as const },
    ];
    (window as unknown as { sherpa: { files: { readDir: ReturnType<typeof vi.fn> } } })
      .sherpa.files.readDir = vi.fn().mockResolvedValue(entries);

    useProject.setState({
      current: { id: 'p', name: 'TestProject', path: '/test/path', addedAt: 'now' },
      recent: [], busy: false, error: null,
    });

    renderWithI18n(<FilesPanel />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('a.ts')).toBeInTheDocument();
    });
  });

  test('clicking a directory node expands it (toggle)', async () => {
    const rootEntries = [
      { name: 'src', relPath: 'src', kind: 'directory' as const },
    ];
    const srcEntries = [
      { name: 'index.ts', relPath: 'src/index.ts', kind: 'file' as const },
    ];
    const readDir = vi.fn().mockImplementation((_: string, relPath: string) => {
      if (relPath === '') return Promise.resolve(rootEntries);
      if (relPath === 'src') return Promise.resolve(srcEntries);
      return Promise.resolve([]);
    });
    (window as unknown as { sherpa: { files: { readDir: ReturnType<typeof vi.fn> } } })
      .sherpa.files.readDir = readDir;

    useProject.setState({
      current: { id: 'p', name: 'TestProject', path: '/test/path', addedAt: 'now' },
      recent: [], busy: false, error: null,
    });

    renderWithI18n(<FilesPanel />);

    // Wait for root entries to appear
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Click on the 'src' directory to expand
    const srcButton = screen.getByText('src').closest('button')!;
    fireEvent.click(srcButton);

    // After expansion, child should appear
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });
  });

  test('file nodes do not expand on click', async () => {
    const entries = [
      { name: 'a.ts', relPath: 'a.ts', kind: 'file' as const },
    ];
    (window as unknown as { sherpa: { files: { readDir: ReturnType<typeof vi.fn> } } })
      .sherpa.files.readDir = vi.fn().mockResolvedValue(entries);

    useProject.setState({
      current: { id: 'p', name: 'TestProject', path: '/test/path', addedAt: 'now' },
      recent: [], busy: false, error: null,
    });

    renderWithI18n(<FilesPanel />);

    await waitFor(() => {
      expect(screen.getByText('a.ts')).toBeInTheDocument();
    });

    // file node has kind=file attribute
    const btn = screen.getByText('a.ts').closest('button')!;
    expect(btn).toHaveAttribute('data-kind', 'file');
  });
});
