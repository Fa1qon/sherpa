import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { StageForm } from '../../../src/presentation/screens/Library/StageForm';
import en from '../../../src/renderer/locales/en.json';
import type { Methodology } from '../../../src/core/domain/methodology';

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

const DRAFT: Methodology = {
  id: 'm', version: '1', name: 'M', description: 'd',
  stages: [
    { id: 's', name: 'S', mode: 'auto', contract: { input: [], output: { path: 's.md' } } },
  ],
  edges: [],
};

describe('StageForm', () => {
  test('renders current name', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={DRAFT} stageId="s" onChange={vi.fn()} />
      </I18nextProvider>,
    );
    expect((screen.getByDisplayValue('S')).tagName).toBe('INPUT');
  });

  test('typing in name calls onChange with patched draft', () => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={DRAFT} stageId="s" onChange={onChange} />
      </I18nextProvider>,
    );
    fireEvent.change(screen.getByDisplayValue('S'), { target: { value: 'Renamed' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(next.stages[0]!.name).toBe('Renamed');
  });

  test('id field is read-only', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={DRAFT} stageId="s" onChange={vi.fn()} />
      </I18nextProvider>,
    );
    expect((screen.getByDisplayValue('s')).hasAttribute('readonly')).toBe(true);
  });

  test('changing mode calls onChange', () => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={DRAFT} stageId="s" onChange={onChange} />
      </I18nextProvider>,
    );
    const select = screen.getByDisplayValue('auto');
    fireEvent.change(select, { target: { value: 'gate' } });
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(next.stages[0]!.mode).toBe('gate');
  });

  test('returns null when stageId not in draft', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={DRAFT} stageId="missing" onChange={vi.fn()} />
      </I18nextProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
