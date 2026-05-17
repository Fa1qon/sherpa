// Plan 6 Task 7 — tab scaffold + General tab.
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { StageForm } from '../../../../../src/presentation/screens/Library/StageForm';
import en from '../../../../../src/renderer/locales/en.json';
import type { Methodology } from '../../../../../src/core/domain/methodology';

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

const DRAFT: Methodology = {
  id: 'm',
  version: '1',
  name: 'M',
  description: 'd',
  stages: [
    {
      id: 's',
      name: 'S',
      mode: 'auto',
      contract: { input: [], output: { path: 's.md' } },
    },
  ],
  edges: [],
};

const TAB_LABELS = ['General', 'Prompt', 'I/O', 'Tools', 'Reviewers', 'Gate', 'Phases', 'Stuck'] as const;

function renderForm(onChange = vi.fn(), draft: Methodology = DRAFT) {
  return {
    onChange,
    ...render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={draft} stageId="s" onChange={onChange} />
      </I18nextProvider>,
    ),
  };
}

describe('StageForm — tab scaffolding', () => {
  test('renders 8 tabs with expected labels', () => {
    renderForm();
    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(8);
    expect(tabs.map((t) => t.textContent)).toEqual([...TAB_LABELS]);
  });

  test('General tab is selected by default', () => {
    renderForm();
    // General is default — name field visible
    expect(screen.getByDisplayValue('S')).toBeTruthy();
  });

  test('switching away and back to General shows the name field again', () => {
    renderForm();
    fireEvent.click(screen.getByRole('tab', { name: 'Stuck' }));
    // Re-select General tab
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    expect(screen.getByDisplayValue('S')).toBeTruthy();
  });
});

describe('StageForm — General tab', () => {
  test('editing name calls onChange with patched draft', () => {
    const { onChange } = renderForm();
    fireEvent.change(screen.getByDisplayValue('S'), { target: { value: 'Renamed' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(next.stages[0]!.name).toBe('Renamed');
  });

  test('confidence_threshold input accepts 0.7', () => {
    const { onChange } = renderForm();
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.7' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(next.stages[0]!.confidence_threshold).toBe(0.7);
  });

  test('execution_isolation dropdown change calls onChange', () => {
    const { onChange } = renderForm();
    // The dropdown's current value is '' (Inherit). Find the select via its options.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    // mode select shows 'auto'; execution_isolation select shows '' (Inherit).
    const isolationSelect = selects.find((s) => s.value === '');
    expect(isolationSelect).toBeDefined();
    fireEvent.change(isolationSelect!, { target: { value: 'subagent' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(next.stages[0]!.execution_isolation).toBe('subagent');
  });
});
