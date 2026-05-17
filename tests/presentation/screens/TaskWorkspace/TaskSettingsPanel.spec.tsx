// tests/presentation/screens/TaskWorkspace/TaskSettingsPanel.spec.tsx
// Updated for popup/pill redesign (Task 5).

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import {
  TaskSettingsPanel,
  defaultLocalSettings,
  type LocalTaskSettings,
} from '../../../../src/presentation/screens/TaskWorkspace/TaskSettingsPanel';
import en from '../../../../src/renderer/locales/en.json';
import type { Task } from '../../../../src/core/domain/task';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'T',
    status: 'created',
    thread: [],
    config: { autonomy: 'interactive', urgency: 'normal', importance: 'normal' },
    createdAt: '2026-05-12T00:00:00Z',
    updatedAt: '2026-05-12T00:00:00Z',
    totalTokens: { input: 0, output: 0 },
    methodology_selection_mode: 'none',
    settings_locked: false,
    ...overrides,
  };
}

function renderPanel(props: {
  task?: Task;
  settings?: LocalTaskSettings;
  expanded?: boolean;
  methodologies?: readonly { id: string; name: string }[];
  onChange?: (s: Partial<LocalTaskSettings>) => void;
  onToggleExpand?: () => void;
  localTitle?: string;
  onTitleChange?: (title: string) => void;
} = {}) {
  const onChange = props.onChange ?? vi.fn();
  const onToggleExpand = props.onToggleExpand ?? vi.fn();
  const result = render(
    <I18nextProvider i18n={i18n}>
      <TaskSettingsPanel
        task={props.task ?? makeTask()}
        settings={props.settings ?? defaultLocalSettings()}
        onChange={onChange}
        expanded={props.expanded ?? true}
        onToggleExpand={onToggleExpand}
        methodologies={props.methodologies ?? []}
        localTitle={props.localTitle ?? ''}
        onTitleChange={props.onTitleChange}
      />
    </I18nextProvider>,
  );
  return { ...result, onChange, onToggleExpand };
}

describe('TaskSettingsPanel', () => {
  test('renders popup with all pill groups when expanded', () => {
    renderPanel();
    expect(screen.getByTestId('task-settings-panel')).toBeInTheDocument();
    // Methodology pills
    expect(screen.getByTestId('methodology-mode-none')).toBeInTheDocument();
    expect(screen.getByTestId('methodology-mode-router')).toBeInTheDocument();
    expect(screen.getByTestId('methodology-mode-manual')).toBeInTheDocument();
    // Effort pills
    expect(screen.getByTestId('effort-fast')).toBeInTheDocument();
    expect(screen.getByTestId('effort-normal')).toBeInTheDocument();
    expect(screen.getByTestId('effort-thorough')).toBeInTheDocument();
    // Response mode pills
    expect(screen.getByTestId('response-mode-concise')).toBeInTheDocument();
    expect(screen.getByTestId('response-mode-detailed')).toBeInTheDocument();
    // Economy mode pills
    expect(screen.getByTestId('economy-mode-unlimited')).toBeInTheDocument();
    expect(screen.getByTestId('economy-mode-budget')).toBeInTheDocument();
    // Checkboxes
    expect(screen.getByTestId('ask-before-edit-toggle')).toBeInTheDocument();
    // Close button
    expect(screen.getByTestId('settings-collapse-btn')).toBeInTheDocument();
  });

  test('returns null (renders nothing) when expanded=false', () => {
    renderPanel({ expanded: false });
    expect(screen.queryByTestId('task-settings-panel')).toBeNull();
  });

  test('does not show methodology dropdown when mode != manual', () => {
    renderPanel({ settings: defaultLocalSettings() });
    expect(screen.queryByTestId('methodology-id-select')).toBeNull();
  });

  test('shows methodology dropdown when mode = manual', () => {
    const settings: LocalTaskSettings = {
      ...defaultLocalSettings(),
      methodology_selection_mode: 'manual',
    };
    renderPanel({
      settings,
      methodologies: [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
    });
    const select = screen.getByTestId('methodology-id-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toContain('Alpha');
    expect(labels).toContain('Beta');
  });

  test('shows router placeholder text when mode = router', () => {
    const settings: LocalTaskSettings = {
      ...defaultLocalSettings(),
      methodology_selection_mode: 'router',
    };
    renderPanel({ settings });
    expect(screen.getByText(/Router not yet implemented/)).toBeInTheDocument();
  });

  test('clicking effort pill emits onChange', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByTestId('effort-thorough'));
    expect(onChange).toHaveBeenCalledWith({ effort: 'thorough' });
  });

  test('clicking effort-fast pill emits onChange with fast', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByTestId('effort-fast'));
    expect(onChange).toHaveBeenCalledWith({ effort: 'fast' });
  });

  test('clicking response-mode pill emits onChange', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByTestId('response-mode-concise'));
    expect(onChange).toHaveBeenCalledWith({ response_mode: 'concise' });
  });

  test('clicking economy-mode pill emits onChange', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByTestId('economy-mode-budget'));
    expect(onChange).toHaveBeenCalledWith({ economy_mode: 'budget' });
  });

  test('toggling ask-before-edit emits onChange', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByTestId('ask-before-edit-toggle'));
    expect(onChange).toHaveBeenCalledWith({ ask_before_edit: true });
  });

  test('switching methodology mode pill emits onChange', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByTestId('methodology-mode-manual'));
    expect(onChange).toHaveBeenCalledWith({ methodology_selection_mode: 'manual' });
  });

  test('clicking close button triggers onToggleExpand', () => {
    const { onToggleExpand } = renderPanel();
    fireEvent.click(screen.getByTestId('settings-collapse-btn'));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  test('involvement preset pills are rendered', () => {
    renderPanel();
    expect(screen.getByTestId('preset-autopilot')).toBeInTheDocument();
    expect(screen.getByTestId('preset-standard')).toBeInTheDocument();
    expect(screen.getByTestId('preset-control')).toBeInTheDocument();
    expect(screen.getByTestId('preset-manual')).toBeInTheDocument();
  });

  test('clicking involvement preset emits strictness/response/ask changes', () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByTestId('preset-autopilot'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ strictness_mode: expect.any(String) }),
    );
  });

  test('task title input renders and fires onTitleChange', () => {
    const onTitleChange = vi.fn();
    renderPanel({ localTitle: 'My task', onTitleChange });
    const input = screen.getByTestId('task-title-input') as HTMLInputElement;
    expect(input.value).toBe('My task');
    fireEvent.change(input, { target: { value: 'Updated' } });
    expect(onTitleChange).toHaveBeenCalledWith('Updated');
  });

  test('settings_locked disables methodology buttons but not preset buttons', () => {
    renderPanel({ task: makeTask({ settings_locked: true }) });
    // Involvement presets remain enabled after lock (behavioral settings, always editable).
    const presetBtn = screen.getByTestId('preset-autopilot') as HTMLButtonElement;
    expect(presetBtn.disabled).toBe(false);
    // Methodology mode is locked after first send.
    const methodologyBtn = screen.getByTestId('methodology-mode-router') as HTMLButtonElement;
    expect(methodologyBtn.disabled).toBe(true);
  });

  test('locked + expanded still shows full panel with collapse button', () => {
    renderPanel({
      task: makeTask({ settings_locked: true }),
      expanded: true,
    });
    expect(screen.getByTestId('task-settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('settings-collapse-btn')).toBeInTheDocument();
  });
});
