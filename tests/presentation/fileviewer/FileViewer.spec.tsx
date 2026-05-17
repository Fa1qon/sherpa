import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { FileViewer } from '../../../src/presentation/fileviewer/FileViewer';
import { useNavigation } from '../../../src/renderer/store/navigation';
import { useProject } from '../../../src/renderer/store/project';
import en from '../../../src/renderer/locales/en.json';

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <div data-testid="codemirror">{value}</div>,
}));

vi.mock('../../../src/renderer/ipc/client', () => ({
  ipcClient: {
    files: () => ({
      readFile: vi.fn().mockResolvedValue('# Hello\n\nWorld'),
      readBinary: vi.fn().mockResolvedValue('iVBOR...'),
    }),
  },
}));

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

beforeEach(() => {
  useNavigation.setState({ tabs: [], activeTabId: null });
  useProject.setState({ current: { path: '/project', name: 'project' } as never });
});

const wrap = (ui: React.ReactElement) => (
  <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
);

describe('FileViewer', () => {
  test('shows loading state initially', () => {
    useNavigation.getState().openTab({ kind: 'file', params: { relPath: 'README.md' }, title: 'README.md' });
    render(wrap(<FileViewer />));
    expect(screen.getByText(/загрузка|loading/i)).toBeTruthy();
  });

  test('shows file name in breadcrumb', async () => {
    useNavigation.getState().openTab({ kind: 'file', params: { relPath: 'src/index.ts' }, title: 'index.ts' });
    render(wrap(<FileViewer />));
    await waitFor(() => expect(screen.queryByText(/загрузка|loading/i)).toBeNull());
    expect(screen.getByText('index.ts')).toBeTruthy();
  });

  test('shows error when no relPath', () => {
    useNavigation.getState().openTab({ kind: 'file', title: 'unknown' });
    render(wrap(<FileViewer />));
    expect(screen.getByText(/error|ошибка/i)).toBeTruthy();
  });
});
