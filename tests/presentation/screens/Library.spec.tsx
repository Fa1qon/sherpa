// tests/presentation/screens/Library.spec.tsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { Library } from '../../../src/presentation/screens/Library';
import { useMethodology } from '../../../src/renderer/store/methodology';
import { useProject } from '../../../src/renderer/store/project';
import en from '../../../src/renderer/locales/en.json';

// DagView uses @xyflow/react which doesn't render well in jsdom.
// Mock it out — we test that Library wiring works, not that xyflow renders.
vi.mock('../../../src/presentation/screens/Library/DagView', () => ({
  DagView: () => <div data-testid="dag-view" />,
}));

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const SAMPLE = {
  id: 'a', version: '1', name: 'A', description: 'a desc',
  stages: [{ id: 's', name: 'S', mode: 'auto' as const, contract: { input: [], output: { path: 's.md' } } }],
  edges: [
    { from: 'start', to: 's', condition: { kind: 'always' as const } },
    { from: 's', to: 'end', condition: { kind: 'always' as const } },
  ],
};

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never, settings: {} as never,
    methodology: {
      list: vi.fn().mockResolvedValue([
        { id: 'a', version: '1', name: 'A', description: 'a desc', sourcePath: '/p/a.md', warnings: [] },
      ]),
      load: vi.fn().mockResolvedValue({ ok: true, methodology: SAMPLE, warnings: [] }),
      save: vi.fn(),
    },
  };
  useProject.setState({
    current: { id: 'p', name: 'p', path: '/p', addedAt: 'now' },
    recent: [], busy: false, error: null,
  });
  useMethodology.setState({ list: [], selectedId: null, current: null, loading: false, error: null });
});

describe('Library screen', () => {
  test('renders list + auto-selects + shows detail', async () => {
    render(<I18nextProvider i18n={i18n}><Library /></I18nextProvider>);
    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('a desc')).toBeInTheDocument();
    });
  });

  test('shows empty message when no methodologies', async () => {
    (window.sherpa.methodology.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    render(<I18nextProvider i18n={i18n}><Library /></I18nextProvider>);
    await waitFor(() => {
      expect(screen.getByText('No methodologies in this project.')).toBeInTheDocument();
    });
  });
});
