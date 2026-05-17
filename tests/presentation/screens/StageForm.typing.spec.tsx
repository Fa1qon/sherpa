// tests/presentation/screens/StageForm.typing.spec.tsx
// Regression: when user types into a stage field, every character must persist.
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import type { ReactElement } from 'react';
import { StageForm } from '../../../src/presentation/screens/Library/StageForm';
import en from '../../../src/renderer/locales/en.json';
import type { Methodology } from '../../../src/core/domain/methodology';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

function makeMethodology(): Methodology {
  return {
    id: 'x',
    version: '1',
    name: 'X',
    description: '',
    stages: [{
      id: 's1', name: 'Initial', mode: 'auto',
      contract: { input: [], output: { path: 's1.md' } },
    }],
    edges: [],
  };
}

describe('StageForm typing regression', () => {
  test('typing in name field accumulates characters across re-renders', async () => {
    let draft = makeMethodology();
    const onChange = vi.fn();

    function Wrapper(): ReactElement {
      // Re-render with latest draft so the prop reflects state, simulating MethodologyDetail.
      return <StageForm draft={draft} stageId="s1" onChange={onChange} />;
    }

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <Wrapper />
      </I18nextProvider>,
    );

    // Force re-render after each onChange call so we mimic React-store update cycle
    // (in production, applyDraft -> set -> re-render via zustand subscription).
    onChange.mockImplementation((next: Methodology) => {
      draft = next;
      rerender(<I18nextProvider i18n={i18n}><Wrapper /></I18nextProvider>);
    });

    const nameInput = screen.getByDisplayValue('Initial') as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'abc');

    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(3);
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Methodology;
    expect(last.stages[0]!.name).toBe('abc');
  });

  // Plan 6 Task 8 — Prompt tab wired; assert against system_prompt_template.
  test('typing in prompt textarea accumulates characters across re-renders', async () => {
    let draft = makeMethodology();
    const onChange = vi.fn();

    function Wrapper(): ReactElement {
      return <StageForm draft={draft} stageId="s1" onChange={onChange} />;
    }

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <Wrapper />
      </I18nextProvider>,
    );

    onChange.mockImplementation((next: Methodology) => {
      draft = next;
      rerender(<I18nextProvider i18n={i18n}><Wrapper /></I18nextProvider>);
    });

    // Switch to the Prompt tab.
    const promptTab = screen.getByRole('tab', { name: 'Prompt' });
    await userEvent.click(promptTab);

    const systemTextarea = screen.getByRole('textbox', {
      name: /system/i,
    }) as HTMLTextAreaElement;
    await userEvent.click(systemTextarea);
    await userEvent.type(systemTextarea, 'hello');

    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(5);
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Methodology;
    expect(last.stages[0]!.system_prompt_template).toBe('hello');
  });
});
