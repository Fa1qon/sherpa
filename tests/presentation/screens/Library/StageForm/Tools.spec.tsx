// Plan 7 Task 3 — Tools tab tests (2-checkbox model: required / forbidden, mutex).
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
      id: 's',
      name: 'S',
      mode: 'auto',
      contract: { input: [], output: { path: 's.md' } },
    },
  ],
  edges: [],
};

function renderForm(onChange = vi.fn(), draft: Methodology = DRAFT) {
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <StageForm draft={draft} stageId="s" onChange={onChange} />
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Tools' }));
  return { onChange, ...utils };
}

function draftWithTools(tools: NonNullable<Methodology['stages'][number]['tools']>): Methodology {
  return {
    ...DRAFT,
    stages: DRAFT.stages.map((s) => (s.id === 's' ? { ...s, tools } : s)),
  };
}

function stageFromCall(onChange: ReturnType<typeof vi.fn>, callIndex = 0) {
  const next = onChange.mock.calls[callIndex]![0] as Methodology;
  return next.stages.find((s) => s.id === 's')!;
}

describe('Tools tab — 2-checkbox model', () => {
  test('default: no IR entry, both checkboxes unchecked for every tool', () => {
    renderForm();
    const reqRead = screen.getByTestId('tool-Read-required') as HTMLInputElement;
    const fbnRead = screen.getByTestId('tool-Read-forbidden') as HTMLInputElement;
    const reqBash = screen.getByTestId('tool-Bash-required') as HTMLInputElement;
    const fbnBash = screen.getByTestId('tool-Bash-forbidden') as HTMLInputElement;
    expect(reqRead.checked).toBe(false);
    expect(fbnRead.checked).toBe(false);
    expect(reqBash.checked).toBe(false);
    expect(fbnBash.checked).toBe(false);
    // No legacy testids should exist.
    expect(screen.queryByTestId('tool-Read-allowed')).toBeNull();
    expect(screen.queryByTestId('tool-Read-none')).toBeNull();
  });

  test('check required on Read → tools.required contains "Read"', () => {
    const { onChange } = renderForm();
    fireEvent.click(screen.getByTestId('tool-Read-required'));
    expect(onChange).toHaveBeenCalled();
    const stage = stageFromCall(onChange);
    expect(stage.tools?.required).toEqual(['Read']);
    expect(stage.tools?.forbidden).toBeUndefined();
    expect(stage.tools?.allowed).toBeUndefined();
  });

  test('check forbidden on Bash → tools.forbidden contains "Bash"', () => {
    const { onChange } = renderForm();
    fireEvent.click(screen.getByTestId('tool-Bash-forbidden'));
    expect(onChange).toHaveBeenCalled();
    const stage = stageFromCall(onChange);
    expect(stage.tools?.forbidden).toEqual(['Bash']);
    expect(stage.tools?.required).toBeUndefined();
    expect(stage.tools?.allowed).toBeUndefined();
  });

  test('mutex: check required while forbidden was checked → forbidden cleared', () => {
    const { onChange } = renderForm(vi.fn(), draftWithTools({ forbidden: ['Read'] }));
    // Sanity: forbidden is checked initially.
    const fbnReadBefore = screen.getByTestId('tool-Read-forbidden') as HTMLInputElement;
    expect(fbnReadBefore.checked).toBe(true);

    fireEvent.click(screen.getByTestId('tool-Read-required'));
    expect(onChange).toHaveBeenCalled();
    const stage = stageFromCall(onChange);
    expect(stage.tools?.required).toEqual(['Read']);
    expect(stage.tools?.forbidden).toBeUndefined();
  });

  test('uncheck required on a tool → tools become undefined when nothing else is set', () => {
    const { onChange } = renderForm(vi.fn(), draftWithTools({ required: ['Read'] }));
    const reqRead = screen.getByTestId('tool-Read-required') as HTMLInputElement;
    expect(reqRead.checked).toBe(true);

    fireEvent.click(reqRead); // uncheck
    expect(onChange).toHaveBeenCalled();
    const stage = stageFromCall(onChange);
    expect(stage.tools).toBeUndefined();
  });

  test('clear last required → tools.required omitted, other buckets preserved', () => {
    const { onChange } = renderForm(
      vi.fn(),
      draftWithTools({ required: ['Read'], forbidden: ['Bash'] }),
    );
    fireEvent.click(screen.getByTestId('tool-Read-required')); // uncheck Read-required
    expect(onChange).toHaveBeenCalled();
    const stage = stageFromCall(onChange);
    expect(stage.tools?.forbidden).toEqual(['Bash']);
    expect(stage.tools?.required).toBeUndefined();
  });

  test('all checkboxes unchecked → tools field becomes undefined', () => {
    const { onChange } = renderForm(vi.fn(), draftWithTools({ forbidden: ['Bash'] }));
    fireEvent.click(screen.getByTestId('tool-Bash-forbidden')); // uncheck
    const stage = stageFromCall(onChange);
    expect(stage.tools).toBeUndefined();
  });

  test('preserves tools.allowed if set (passthrough round-trip)', () => {
    const { onChange } = renderForm(vi.fn(), draftWithTools({ allowed: ['Read'] }));
    fireEvent.click(screen.getByTestId('tool-Bash-required'));
    expect(onChange).toHaveBeenCalled();
    const stage = stageFromCall(onChange);
    expect(stage.tools?.allowed).toEqual(['Read']);
    expect(stage.tools?.required).toEqual(['Bash']);
    expect(stage.tools?.forbidden).toBeUndefined();
  });
});
