import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { Library } from '../../../src/presentation/screens/Library';
import { useMethodology } from '../../../src/renderer/store/methodology';
import { useProject } from '../../../src/renderer/store/project';
import en from '../../../src/renderer/locales/en.json';
import type { Methodology } from '../../../src/core/domain/methodology';

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

vi.mock('../../../src/presentation/screens/Library/DagView', () => ({
  DagView: () => <div data-testid="dag-view-mock" />,
}));
vi.mock('../../../src/presentation/screens/Library/EditCanvas', () => ({
  EditCanvas: (props: { onSelectStage: (id: string) => void }) => (
    <div data-testid="edit-canvas-mock">
      <button onClick={() => props.onSelectStage('s')}>pick-stage-s</button>
    </div>
  ),
}));

const SAMPLE: Methodology = {
  id: 'a', version: '1', name: 'A', description: 'desc',
  stages: [{ id: 's', name: 'S', mode: 'auto', contract: { input: [], output: { path: 's.md' } } }],
  edges: [
    { from: 'start', to: 's', condition: { kind: 'always' } },
    { from: 's', to: 'end', condition: { kind: 'always' } },
  ],
};

beforeEach(() => {
  (window as { sherpa?: unknown }).sherpa = {
    project: {} as never,
    settings: {} as never,
    methodology: {
      list: vi.fn().mockResolvedValue([
        { id: 'a', version: '1', name: 'A', description: 'desc', sourcePath: '/p/a.md', warnings: [] },
      ]),
      load: vi.fn().mockResolvedValue({ ok: true, methodology: SAMPLE, warnings: [] }),
      save: vi.fn(),
    },
  };
  useProject.setState({
    current: { id: 'p', name: 'p', path: '/p', addedAt: 'now' },
    recent: [], busy: false, error: null,
  });
  useMethodology.setState({
    list: [], selectedId: null, current: null, loading: false, error: null,
    mode: 'view', draft: null, dirty: false, history: { past: [], future: [] },
  });
});

describe('Library — Edit mode', () => {
  test('starts in view mode (DagView mounted)', async () => {
    render(<I18nextProvider i18n={i18n}><Library /></I18nextProvider>);
    await waitFor(() => expect(screen.getByTestId('dag-view-mock')).toBeInTheDocument());
    expect(screen.queryByTestId('edit-canvas-mock')).toBeNull();
  });

  test('clicking Edit switches to EditCanvas + shows toolbar buttons', async () => {
    render(<I18nextProvider i18n={i18n}><Library /></I18nextProvider>);
    await waitFor(() => expect(screen.getByTestId('dag-view-mock')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByTestId('edit-canvas-mock')).toBeInTheDocument());
    expect(screen.getByText(/^Save/)).toBeInTheDocument();
    expect(screen.getByText('+ Stage')).toBeInTheDocument();
    expect(screen.getByText('Validate')).toBeInTheDocument();
  });

  test('selecting a stage opens the StageForm', async () => {
    render(<I18nextProvider i18n={i18n}><Library /></I18nextProvider>);
    await waitFor(() => expect(screen.getByTestId('dag-view-mock')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByTestId('edit-canvas-mock')).toBeInTheDocument());
    fireEvent.click(screen.getByText('pick-stage-s'));
    await waitFor(() => expect(screen.getByTestId('stage-form')).toBeInTheDocument());
  });

  test('clicking Save (after a draft edit) calls methodology.save', async () => {
    render(<I18nextProvider i18n={i18n}><Library /></I18nextProvider>);
    await waitFor(() => expect(screen.getByTestId('dag-view-mock')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(screen.getByTestId('edit-canvas-mock')).toBeInTheDocument());
    fireEvent.click(screen.getByText('pick-stage-s'));
    const nameInput = await screen.findByDisplayValue('S');
    fireEvent.change(nameInput, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText(/^Save/));
    await waitFor(() => {
      expect(window.sherpa.methodology.save).toHaveBeenCalled();
    });
    const saved = (window.sherpa.methodology.save as ReturnType<typeof vi.fn>).mock.calls[0]![1] as Methodology;
    expect(saved.stages[0]!.name).toBe('Renamed');
  });
});
