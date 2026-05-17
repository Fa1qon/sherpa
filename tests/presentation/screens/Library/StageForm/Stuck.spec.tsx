// Plan 6 Task 13 — Stuck tab tests.
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { StageForm } from '../../../../../src/presentation/screens/Library/StageForm';
import en from '../../../../../src/renderer/locales/en.json';
import type {
  Methodology,
  StuckEscalationStep,
} from '../../../../../src/core/domain/methodology';

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

function renderForm(
  onChange = vi.fn(),
  draft: Methodology = DRAFT,
) {
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <StageForm draft={draft} stageId="s" onChange={onChange} />
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Stuck' }));
  return { onChange, ...utils };
}

function getStage(next: Methodology) {
  return next.stages.find((st) => st.id === 's')!;
}

describe('Stuck tab — max_attempts', () => {
  test('editing max_attempts updates the IR', () => {
    const { onChange } = renderForm();
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('3');
    fireEvent.change(input, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = getStage(next);
    expect(stage.stuck_policy).toEqual({
      max_attempts: 5,
      escalation_steps: [],
    });
  });
});

describe('Stuck tab — escalation steps', () => {
  test('toggling user_override then change_tactics preserves declared order', () => {
    // Start with no policy: default { max_attempts: 3, escalation_steps: [] }
    const onChange = vi.fn();
    let draft: Methodology = DRAFT;

    // First toggle: user_override (last in STEP_OPTIONS).
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={draft} stageId="s" onChange={onChange} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Stuck' }));

    const userOverrideCheckbox = screen.getByLabelText(
      'User override',
    ) as HTMLInputElement;
    fireEvent.click(userOverrideCheckbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    const after1 = onChange.mock.calls[0]![0] as Methodology;
    expect(after1.stages[0]!.stuck_policy?.escalation_steps).toEqual([
      'user_override',
    ]);

    // Apply the first change to the draft and re-render.
    draft = after1;
    rerender(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={draft} stageId="s" onChange={onChange} />
      </I18nextProvider>,
    );

    // Now toggle change_tactics (first in STEP_OPTIONS).
    const changeTacticsCheckbox = screen.getByLabelText(
      'Change tactics',
    ) as HTMLInputElement;
    fireEvent.click(changeTacticsCheckbox);

    expect(onChange).toHaveBeenCalledTimes(2);
    const after2 = onChange.mock.calls[1]![0] as Methodology;
    const finalSteps: readonly StuckEscalationStep[] =
      after2.stages[0]!.stuck_policy?.escalation_steps ?? [];
    expect(finalSteps).toEqual(['change_tactics', 'user_override']);
  });

  test('toggling off a step removes it and preserves the rest in declared order', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 's'
          ? {
              ...s,
              stuck_policy: {
                max_attempts: 3,
                escalation_steps: [
                  'change_tactics',
                  'request_logging',
                  'user_override',
                ] as readonly StuckEscalationStep[],
              },
            }
          : s,
      ),
    };
    const { onChange } = renderForm(vi.fn(), draft);

    const requestLoggingCheckbox = screen.getByLabelText(
      'Request logging',
    ) as HTMLInputElement;
    expect(requestLoggingCheckbox.checked).toBe(true);
    fireEvent.click(requestLoggingCheckbox);

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = getStage(next);
    expect(stage.stuck_policy?.escalation_steps).toEqual([
      'change_tactics',
      'user_override',
    ]);
  });
});

describe('Stuck tab — error_compaction', () => {
  test('toggling on sets error_compaction=true; toggling off makes it undefined', () => {
    const onChange = vi.fn();
    let draft: Methodology = DRAFT;

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={draft} stageId="s" onChange={onChange} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Stuck' }));

    const checkbox = screen.getByLabelText(
      'Compact error to 1-2 sentences between cycles',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Toggle on.
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    const after1 = onChange.mock.calls[0]![0] as Methodology;
    expect(after1.stages[0]!.stuck_policy?.error_compaction).toBe(true);

    draft = after1;
    rerender(
      <I18nextProvider i18n={i18n}>
        <StageForm draft={draft} stageId="s" onChange={onChange} />
      </I18nextProvider>,
    );

    // Toggle off — `|| undefined` semantics: false becomes undefined (not present).
    const checkbox2 = screen.getByLabelText(
      'Compact error to 1-2 sentences between cycles',
    ) as HTMLInputElement;
    expect(checkbox2.checked).toBe(true);
    fireEvent.click(checkbox2);
    expect(onChange).toHaveBeenCalledTimes(2);
    const after2 = onChange.mock.calls[1]![0] as Methodology;
    expect(after2.stages[0]!.stuck_policy?.error_compaction).toBeUndefined();
  });
});

describe('Stuck tab — tracker_template', () => {
  test('typing a template populates tracker_template', () => {
    const { onChange } = renderForm();
    const textarea = screen.getByPlaceholderText(
      'Stage W2 complete: {summary}',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'Stage done: {summary}' },
    });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).tracker_template).toBe('Stage done: {summary}');
  });

  test('clearing the template sets tracker_template to undefined', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 's' ? { ...s, tracker_template: 'something' } : s,
      ),
    };
    const { onChange } = renderForm(vi.fn(), draft);
    const textarea = screen.getByPlaceholderText(
      'Stage W2 complete: {summary}',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('something');
    fireEvent.change(textarea, { target: { value: '' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).tracker_template).toBeUndefined();
  });
});

describe('Stuck tab — per-step descriptions + engine note', () => {
  test('per-step description rendered below each checkbox', () => {
    const { container } = renderForm();
    // Check at least 2 descriptions are rendered to verify the pattern.
    expect(container.textContent).toContain('Switch to a different approach');
    expect(container.textContent).toContain('Ask the user which direction');
  });

  test('engine note rendered at the bottom of the tab', () => {
    const { container } = renderForm();
    expect(container.textContent).toContain(
      'actual behaviour of each step is executed by the task engine',
    );
  });

  test('checkbox state changes still persist to IR (regression check)', () => {
    const { onChange } = renderForm();
    const cb = screen.getByRole('checkbox', {
      name: /^Change tactics$/,
    }) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).stuck_policy?.escalation_steps).toEqual([
      'change_tactics',
    ]);
  });
});
