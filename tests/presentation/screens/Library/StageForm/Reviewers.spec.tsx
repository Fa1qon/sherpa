// Plan 6 Task 11 — Reviewers tab tests.
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
  fireEvent.click(screen.getByRole('tab', { name: 'Reviewers' }));
  return { onChange, ...utils };
}

function draftWithReviewers(
  reviewers: NonNullable<Methodology['stages'][number]['reviewers']>,
): Methodology {
  return {
    ...DRAFT,
    stages: DRAFT.stages.map((s) => (s.id === 's' ? { ...s, reviewers } : s)),
  };
}

describe('Reviewers tab', () => {
  test('checking a reviewer adds {reviewer_id, recommended: false} to stage.reviewers', () => {
    const { onChange } = renderForm();
    const cb = screen.getByTestId('reviewer-requirements_quality') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = next.stages.find((s) => s.id === 's')!;
    expect(stage.reviewers).toEqual([
      { reviewer_id: 'requirements_quality', recommended: false },
    ]);
  });

  test('clicking the star toggles recommended to true', () => {
    const { onChange } = renderForm(
      vi.fn(),
      draftWithReviewers([{ reviewer_id: 'fact_checker', recommended: false }]),
    );
    fireEvent.click(screen.getByTestId('star-fact_checker'));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = next.stages.find((s) => s.id === 's')!;
    expect(stage.reviewers).toEqual([{ reviewer_id: 'fact_checker', recommended: true }]);
  });

  test('unchecking a reviewer removes it from stage.reviewers', () => {
    const { onChange } = renderForm(
      vi.fn(),
      draftWithReviewers([
        { reviewer_id: 'fact_checker', recommended: false },
        { reviewer_id: 'tone_reviewer', recommended: true },
      ]),
    );
    const cb = screen.getByTestId('reviewer-fact_checker') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = next.stages.find((s) => s.id === 's')!;
    expect(stage.reviewers).toEqual([{ reviewer_id: 'tone_reviewer', recommended: true }]);
  });

  test('star is hidden when the reviewer is not checked', () => {
    renderForm();
    expect(screen.queryByTestId('star-requirements_quality')).toBeNull();
  });

  test('star is shown when the reviewer is checked', () => {
    renderForm(
      vi.fn(),
      draftWithReviewers([{ reviewer_id: 'requirements_quality', recommended: false }]),
    );
    expect(screen.getByTestId('star-requirements_quality')).toBeTruthy();
  });

  test('unchecking the last reviewer makes stage.reviewers undefined', () => {
    const { onChange } = renderForm(
      vi.fn(),
      draftWithReviewers([{ reviewer_id: 'devils_advocate', recommended: false }]),
    );
    fireEvent.click(screen.getByTestId('reviewer-devils_advocate'));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = next.stages.find((s) => s.id === 's')!;
    expect(stage.reviewers).toBeUndefined();
  });

  test('toggling star back from true returns to false (not removed)', () => {
    const { onChange } = renderForm(
      vi.fn(),
      draftWithReviewers([{ reviewer_id: 'fact_checker', recommended: true }]),
    );
    fireEvent.click(screen.getByTestId('star-fact_checker'));
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = next.stages.find((s) => s.id === 's')!;
    expect(stage.reviewers).toEqual([{ reviewer_id: 'fact_checker', recommended: false }]);
  });

  test('explainer rendered at the top of Reviewers tab', () => {
    const { container } = renderForm();
    expect(container.textContent).toContain('Reviewers available in the run-time reviewer menu');
  });

  test('star tooltip uses the recommendedTooltip key (not the on/off variants)', () => {
    renderForm(
      vi.fn(),
      draftWithReviewers([{ reviewer_id: 'fact_checker', recommended: false }]),
    );
    const star = screen.getByTestId('star-fact_checker');
    expect(star.getAttribute('title')).toBe('Recommended in the run-time menu');
  });
});
