// Plan 6 Task 12 — Phases tab tests.
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
      id: 'plan',
      name: 'Plan',
      mode: 'auto',
      contract: { input: [], output: { path: 'plan.md' } },
    },
    {
      id: 'impl',
      name: 'Implementation',
      mode: 'auto',
      contract: { input: [], output: { path: 'impl.md' } },
    },
  ],
  edges: [],
};

function renderForm(
  stageId: string,
  onChange = vi.fn(),
  draft: Methodology = DRAFT,
) {
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <StageForm draft={draft} stageId={stageId} onChange={onChange} />
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Phases' }));
  return { onChange, ...utils };
}

function getImpl(next: Methodology) {
  return next.stages.find((s) => s.id === 'impl')!;
}

describe('Phases tab — source switcher', () => {
  test('switching to from_artifact sets phases_source and seeds phases_from_artifact', () => {
    const { onChange } = renderForm('impl');
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const fromArtifactRadio = radios.find(
      (r) => !r.checked,
    ) as HTMLInputElement;
    expect(fromArtifactRadio).toBeDefined();
    fireEvent.click(fromArtifactRadio);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases_source).toBe('from_artifact');
    expect(impl.phases_from_artifact).toEqual({
      stage_id: '',
      artifact: '',
      section: '## Phases',
    });
    // phases stays undefined / empty (validator allows empty array for inline-cleared)
    expect(impl.phases).toBeUndefined();
  });

  test('switching back to inline clears phases_from_artifact and phases_source', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? {
              ...s,
              phases_source: 'from_artifact' as const,
              phases_from_artifact: {
                stage_id: 'plan',
                artifact: 'plan.md',
                section: '## Phases',
              },
            }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const inlineRadio = radios.find((r) => !r.checked) as HTMLInputElement;
    expect(inlineRadio).toBeDefined();
    fireEvent.click(inlineRadio);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases_source).toBeUndefined();
    expect(impl.phases_from_artifact).toBeUndefined();
  });
});

describe('Phases tab — inline mode', () => {
  test('adding a phase grows IR phases array', () => {
    const { onChange } = renderForm('impl');
    fireEvent.click(screen.getByRole('button', { name: /\+ Add phase/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases).toEqual([{ id: 'phase_1', name: 'phase_1' }]);
  });

  test('editing a phase name updates IR', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? { ...s, phases: [{ id: 'phase_1', name: 'phase_1' }] }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    const nameInput = screen.getByPlaceholderText('name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Discover' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases).toEqual([{ id: 'phase_1', name: 'Discover' }]);
  });

  test('removing the last phase sets phases to undefined', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? { ...s, phases: [{ id: 'phase_1', name: 'phase_1' }] }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases).toBeUndefined();
  });

  test('removing one of two phases leaves the other', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? {
              ...s,
              phases: [
                { id: 'phase_1', name: 'P1' },
                { id: 'phase_2', name: 'P2' },
              ],
            }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]!);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases).toEqual([{ id: 'phase_2', name: 'P2' }]);
  });
});

describe('Phases tab — from_artifact picker', () => {
  test('setting source stage updates phases_from_artifact.stage_id', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? {
              ...s,
              phases_source: 'from_artifact' as const,
              phases_from_artifact: {
                stage_id: '',
                artifact: '',
                section: '## Phases',
              },
            }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    // The first <select> in this tab is the source stage select.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const stageSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === 'plan'),
    );
    expect(stageSelect).toBeDefined();
    fireEvent.change(stageSelect!, { target: { value: 'plan' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases_from_artifact).toEqual({
      stage_id: 'plan',
      artifact: '',
      section: '## Phases',
    });
  });

  test('setting artifact path updates phases_from_artifact.artifact', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? {
              ...s,
              phases_source: 'from_artifact' as const,
              phases_from_artifact: {
                stage_id: 'plan',
                artifact: '',
                section: '## Phases',
              },
            }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    const artifactInput = screen.getByPlaceholderText('plan.md') as HTMLInputElement;
    fireEvent.change(artifactInput, { target: { value: 'design.md' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases_from_artifact).toEqual({
      stage_id: 'plan',
      artifact: 'design.md',
      section: '## Phases',
    });
  });
});

describe('Phases tab — inline mode — per-phase prompt', () => {
  test('phase row has a collapsible prompt section', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? { ...s, phases: [{ id: 'phase_1', name: 'phase_1' }] }
          : s,
      ),
    };
    const { container } = renderForm('impl', vi.fn(), draft);
    const summary = container.querySelector('summary');
    expect(summary).toBeTruthy();
    expect(summary!.textContent).toBe('Prompt');
    expect(summary!.tagName.toLowerCase()).toBe('summary');
  });

  test('editing the prompt textarea persists Phase.prompt', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? { ...s, phases: [{ id: 'phase_1', name: 'phase_1' }] }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    const textarea = screen.getByPlaceholderText(/What the AI does in this phase/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Generate code for this phase' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases).toEqual([
      { id: 'phase_1', name: 'phase_1', prompt: 'Generate code for this phase' },
    ]);
  });

  test('clearing the prompt textarea sets Phase.prompt to undefined', () => {
    const draft: Methodology = {
      ...DRAFT,
      stages: DRAFT.stages.map((s) =>
        s.id === 'impl'
          ? { ...s, phases: [{ id: 'phase_1', name: 'phase_1', prompt: 'old' }] }
          : s,
      ),
    };
    const { onChange } = renderForm('impl', vi.fn(), draft);
    const textarea = screen.getByPlaceholderText(/What the AI does in this phase/) as HTMLTextAreaElement;
    expect(textarea.value).toBe('old');
    fireEvent.change(textarea, { target: { value: '' } });
    const next = onChange.mock.calls[0]![0] as Methodology;
    const impl = getImpl(next);
    expect(impl.phases).toEqual([{ id: 'phase_1', name: 'phase_1' }]);
  });
});
