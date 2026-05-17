// Plan 6 Task 9 — I/O tab tests.
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { StageForm } from '../../../../../src/presentation/screens/Library/StageForm';
import en from '../../../../../src/renderer/locales/en.json';
import type { Methodology } from '../../../../../src/core/domain/methodology';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const DRAFT: Methodology = {
  id: 'm',
  version: '1',
  name: 'M',
  description: '',
  stages: [
    {
      id: 'requirements',
      name: 'Requirements',
      mode: 'auto',
      contract: { input: [], output: { path: 'requirements.md' } },
    },
    {
      id: 'design',
      name: 'Design',
      mode: 'auto',
      contract: { input: [], output: { path: 'design.md' } },
    },
  ],
  edges: [],
};

function renderForm(stageId: string, onChange = vi.fn(), draft: Methodology = DRAFT) {
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <StageForm draft={draft} stageId={stageId} onChange={onChange} />
    </I18nextProvider>,
  );
  // Click the I/O tab so the panel is mounted.
  fireEvent.click(screen.getByRole('tab', { name: 'I/O' }));
  return { onChange, ...utils };
}

describe('IO tab', () => {
  test('clicking "+ Add input" grows contract.input (seeded from first upstream)', () => {
    const { onChange } = renderForm('design');
    fireEvent.click(screen.getByRole('button', { name: /\+ Add input/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const designStage = next.stages.find((s) => s.id === 'design')!;
    expect(designStage.contract.input).toEqual([
      { stage: 'requirements', artifact: '' },
    ]);
  });

  test('removing an input shrinks contract.input', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'design'
          ? {
              ...s,
              contract: {
                ...s.contract,
                input: [{ stage: 'requirements', artifact: 'requirements.md' }],
              },
            }
          : s,
      ),
    };
    const { onChange } = renderForm('design', vi.fn(), draft);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const designStage = next.stages.find((s) => s.id === 'design')!;
    expect(designStage.contract.input).toEqual([]);
  });

  test('changing output format updates contract.output.format', () => {
    const { onChange } = renderForm('design');
    // Find the format combobox: it has options markdown/plaintext.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const formatSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === 'markdown'),
    );
    expect(formatSelect).toBeDefined();
    fireEvent.change(formatSelect!, { target: { value: 'plaintext' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const designStage = next.stages.find((s) => s.id === 'design')!;
    expect(designStage.contract.output.format).toBe('plaintext');
    expect(designStage.contract.output.path).toBe('design.md');
  });

  test('changing output path updates contract.output.path', () => {
    const { onChange } = renderForm('design');
    const pathInput = screen.getByDisplayValue('design.md') as HTMLInputElement;
    fireEvent.change(pathInput, { target: { value: 'design-doc.md' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const designStage = next.stages.find((s) => s.id === 'design')!;
    expect(designStage.contract.output.path).toBe('design-doc.md');
  });

  test('checking a context-essentials checkbox adds it to context_essentials', () => {
    const { onChange } = renderForm('design');
    const checkbox = screen.getByRole('checkbox', {
      name: /requirements \/ requirements\.md/i,
    });
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const designStage = next.stages.find((s) => s.id === 'design')!;
    expect(designStage.context_essentials).toEqual([
      { stage: 'requirements', artifact: 'requirements.md' },
    ]);
  });

  test('unchecking the last context-essentials checkbox sets it to undefined', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'design'
          ? {
              ...s,
              context_essentials: [
                { stage: 'requirements', artifact: 'requirements.md' },
              ],
            }
          : s,
      ),
    };
    const { onChange } = renderForm('design', vi.fn(), draft);
    const checkbox = screen.getByRole('checkbox', {
      name: /requirements \/ requirements\.md/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const designStage = next.stages.find((s) => s.id === 'design')!;
    expect(designStage.context_essentials).toBeUndefined();
  });

  test('first stage shows "no upstream stages yet" message', () => {
    renderForm('requirements');
    // The context-essentials section will render the help message twice (help text + the no-upstream notice).
    expect(screen.getAllByText(/no upstream stages yet/i).length).toBeGreaterThan(0);
  });
});
