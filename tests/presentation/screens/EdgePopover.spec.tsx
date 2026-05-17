import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { EdgePopover } from '../../../src/presentation/screens/Library/EdgePopover';
import en from '../../../src/renderer/locales/en.json';
import type { Methodology } from '../../../src/core/domain/methodology';

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

const DRAFT: Methodology = {
  id: 'm', version: '1', name: 'M', description: 'd',
  stages: [],
  edges: [
    { from: 'a', to: 'b', condition: { kind: 'always' } },
  ],
};

describe('EdgePopover', () => {
  test('changes condition kind to gate-fail and exposes maxCycles', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <EdgePopover draft={DRAFT} edgeIndex={0} onChange={onChange} onDelete={vi.fn()} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    fireEvent.change(screen.getByDisplayValue('always'), { target: { value: 'gate-fail' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(next.edges[0]!.condition.kind).toBe('gate-fail');

    rerender(
      <I18nextProvider i18n={i18n}>
        <EdgePopover draft={next} edgeIndex={0} onChange={onChange} onDelete={vi.fn()} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    const mcInput = screen.getByLabelText(/maxCycles/i);
    fireEvent.change(mcInput, { target: { value: '2' } });
    const next2 = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Methodology;
    expect(next2.edges[0]!.condition).toEqual({ kind: 'gate-fail', maxCycles: 2 });
  });

  test('switching to branch exposes expr field and persists expr value', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <EdgePopover draft={DRAFT} edgeIndex={0} onChange={onChange} onDelete={vi.fn()} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    fireEvent.change(screen.getByDisplayValue('always'), { target: { value: 'branch' } });
    const draftAfter = onChange.mock.calls[0]![0] as Methodology;
    rerender(
      <I18nextProvider i18n={i18n}>
        <EdgePopover draft={draftAfter} edgeIndex={0} onChange={onChange} onDelete={vi.fn()} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    fireEvent.change(screen.getByLabelText(/expr/i), { target: { value: "x == 'foo'" } });
    const final = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Methodology;
    expect(final.edges[0]!.condition).toEqual({ kind: 'branch', expr: "x == 'foo'" });
  });

  test('delete button calls onDelete', () => {
    const onDelete = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <EdgePopover draft={DRAFT} edgeIndex={0} onChange={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Delete edge'));
    expect(onDelete).toHaveBeenCalled();
  });
});
