import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { StageForm } from '../../../../../src/presentation/screens/Library/StageForm';
import en from '../../../../../src/renderer/locales/en.json';
import type { Methodology, Gate } from '../../../../../src/core/domain/methodology';

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
    { id: 's', name: 'S', mode: 'auto', contract: { input: [], output: { path: 's.md' } } },
  ],
  edges: [],
};

function renderForm(onChange = vi.fn(), draft: Methodology = DRAFT) {
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <StageForm draft={draft} stageId="s" onChange={onChange} />
    </I18nextProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Gate' }));
  return { onChange, ...utils };
}

function getStage(next: Methodology) { return next.stages.find((s) => s.id === 's')!; }
function withGate(gate: Gate): Methodology {
  return { ...DRAFT, stages: DRAFT.stages.map((s) => s.id === 's' ? { ...s, gate } : s) };
}

describe('Gate tab', () => {
  test('default empty state renders Items header and empty hint', () => {
    renderForm();
    expect(screen.getByText('Items')).toBeTruthy();
    expect(screen.getByText(/No items yet/)).toBeTruthy();
  });

  test('+ Add item grows IR gate.items', () => {
    const { onChange } = renderForm();
    fireEvent.click(screen.getByTestId('gate-add-item'));
    const next = onChange.mock.calls[0]![0] as Methodology;
    const stage = getStage(next);
    expect(stage.gate?.items).toEqual([
      { id: 'item_1', label: 'item_1', kind: 'artifact_written' },
    ]);
    expect(stage.gate?.kind).toBe('standard');
  });

  test('editing item label updates IR', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [{ id: 'item_1', label: 'item_1', kind: 'artifact_written' }],
    }));
    const labelInput = screen.getByTestId('gate-item-item_1-label') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Plan written' } });
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate?.items[0]?.label).toBe('Plan written');
  });

  test('changing item kind updates IR', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [{ id: 'item_1', label: 'L', kind: 'artifact_written' }],
    }));
    fireEvent.change(screen.getByTestId('gate-item-item_1-kind'), { target: { value: 'user_confirmed' } });
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate?.items[0]?.kind).toBe('user_confirmed');
  });

  test('hard_stop checkbox toggles IR', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [{ id: 'item_1', label: 'L', kind: 'artifact_written' }],
    }));
    fireEvent.click(screen.getByTestId('gate-item-item_1-hardStop'));
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate?.items[0]?.hard_stop).toBe(true);
  });

  test('move up reorders items', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [
        { id: 'a', label: 'A', kind: 'artifact_written' },
        { id: 'b', label: 'B', kind: 'artifact_written' },
      ],
    }));
    fireEvent.click(screen.getByTestId('gate-item-b-up'));
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate?.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  test('move down reorders items', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [
        { id: 'a', label: 'A', kind: 'artifact_written' },
        { id: 'b', label: 'B', kind: 'artifact_written' },
      ],
    }));
    fireEvent.click(screen.getByTestId('gate-item-a-down'));
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate?.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  test('move up at top is no-op (button disabled)', () => {
    renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [{ id: 'a', label: 'A', kind: 'artifact_written' }],
    }));
    const btn = screen.getByTestId('gate-item-a-up') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test('remove item shrinks IR', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [
        { id: 'a', label: 'A', kind: 'artifact_written' },
        { id: 'b', label: 'B', kind: 'artifact_written' },
      ],
    }));
    fireEvent.click(screen.getByTestId('gate-item-a-remove'));
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate?.items.map((i) => i.id)).toEqual(['b']);
  });

  test('removing last item with standard kind sets gate to undefined', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [{ id: 'a', label: 'A', kind: 'artifact_written' }],
    }));
    fireEvent.click(screen.getByTestId('gate-item-a-remove'));
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate).toBeUndefined();
  });

  test('switching gate kind updates IR (preserves items)', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [{ id: 'a', label: 'A', kind: 'artifact_written' }],
    }));
    fireEvent.change(screen.getByTestId('gate-kind'), { target: { value: 'comprehension' } });
    const next = onChange.mock.calls[0]![0] as Methodology;
    expect(getStage(next).gate?.kind).toBe('comprehension');
    expect(getStage(next).gate?.items).toHaveLength(1);
  });

  test('auto_pass_when via ExpressionBuilder persists formatted string', () => {
    const { onChange } = renderForm(vi.fn(), withGate({
      kind: 'standard',
      items: [{ id: 'a', label: 'A', kind: 'artifact_written' }],
    }));
    const ta = screen.getByTestId('expression-builder-textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "scope_unchanged()" } });
    fireEvent.blur(ta);
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as Methodology;
    expect(getStage(last).gate?.items[0]?.auto_pass_when).toEqual({ expr: 'scope_unchanged()' });
  });
});
