// Plan 6 Task 8 — Prompt tab tests.
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { Prompt } from '../../../../../src/presentation/screens/Library/StageForm/tabs/Prompt';
import en from '../../../../../src/renderer/locales/en.json';
import type { Stage } from '../../../../../src/core/domain/methodology';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

function makeStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 's1',
    name: 'S1',
    mode: 'auto',
    contract: { input: [], output: { path: 's1.md' } },
    ...overrides,
  };
}

function renderPrompt(stage: Stage, onUpdate = vi.fn()) {
  return {
    onUpdate,
    ...render(
      <I18nextProvider i18n={i18n}>
        <Prompt stage={stage} onUpdate={onUpdate} />
      </I18nextProvider>,
    ),
  };
}

describe('Prompt tab', () => {
  test('editing system_prompt_template calls onUpdate with new value', () => {
    const { onUpdate } = renderPrompt(makeStage());
    const textarea = screen.getByRole('textbox', { name: /system/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'You are a planner.' } });
    expect(onUpdate).toHaveBeenCalledWith({
      system_prompt_template: 'You are a planner.',
    });
  });

  test('clearing system_prompt_template calls onUpdate with undefined', () => {
    const { onUpdate } = renderPrompt(
      makeStage({ system_prompt_template: 'old' }),
    );
    const textarea = screen.getByRole('textbox', { name: /system/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '' } });
    expect(onUpdate).toHaveBeenCalledWith({ system_prompt_template: undefined });
  });

  test('editing user_view_template calls onUpdate with new value', () => {
    const { onUpdate } = renderPrompt(makeStage());
    const textarea = screen.getByRole('textbox', { name: /user-view/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hi user' } });
    expect(onUpdate).toHaveBeenCalledWith({ user_view_template: 'Hi user' });
  });

  test('clearing user_view_template calls onUpdate with undefined', () => {
    const { onUpdate } = renderPrompt(
      makeStage({ user_view_template: 'old' }),
    );
    const textarea = screen.getByRole('textbox', { name: /user-view/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '' } });
    expect(onUpdate).toHaveBeenCalledWith({ user_view_template: undefined });
  });

  test('setting ai_does on empty role_split sets both fields', () => {
    const { onUpdate } = renderPrompt(makeStage());
    const aiInput = screen.getByRole('textbox', { name: /ai does/i }) as HTMLInputElement;
    fireEvent.change(aiInput, { target: { value: 'asks' } });
    expect(onUpdate).toHaveBeenCalledWith({
      role_split: { ai_does: 'asks', human_does: '' },
    });
  });

  test('setting human_does preserves existing ai_does', () => {
    const { onUpdate } = renderPrompt(
      makeStage({ role_split: { ai_does: 'asks', human_does: '' } }),
    );
    const humanInput = screen.getByRole('textbox', {
      name: /human does/i,
    }) as HTMLInputElement;
    fireEvent.change(humanInput, { target: { value: 'answers' } });
    expect(onUpdate).toHaveBeenCalledWith({
      role_split: { ai_does: 'asks', human_does: 'answers' },
    });
  });

  test('clearing the only non-empty field of role_split makes role_split undefined', () => {
    const { onUpdate } = renderPrompt(
      makeStage({ role_split: { ai_does: 'asks', human_does: '' } }),
    );
    const aiInput = screen.getByRole('textbox', { name: /ai does/i }) as HTMLInputElement;
    fireEvent.change(aiInput, { target: { value: '' } });
    expect(onUpdate).toHaveBeenCalledWith({ role_split: undefined });
  });

  test('clearing ai_does when human_does has content keeps role_split defined', () => {
    const { onUpdate } = renderPrompt(
      makeStage({ role_split: { ai_does: 'asks', human_does: 'answers' } }),
    );
    const aiInput = screen.getByRole('textbox', { name: /ai does/i }) as HTMLInputElement;
    fireEvent.change(aiInput, { target: { value: '' } });
    expect(onUpdate).toHaveBeenCalledWith({
      role_split: { ai_does: '', human_does: 'answers' },
    });
  });
});
