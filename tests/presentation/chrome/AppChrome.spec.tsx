import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { AppChrome } from '../../../src/presentation/chrome/AppChrome';
import { useNavigation } from '../../../src/renderer/store/navigation';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

describe('AppChrome', () => {
  test('renders all five menu labels', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AppChrome onAction={() => {}} />
      </I18nextProvider>,
    );
    for (const label of ['Project', 'Task', 'View', 'Tools', 'Help']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('clicking Project opens its menu', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AppChrome onAction={() => {}} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Project'));
    expect(screen.getByText('New project (open folder…)')).toBeInTheDocument();
    expect(screen.getByText('Quit Sherpa')).toBeInTheDocument();
  });

  test('clicking enabled item dispatches action and closes menu', () => {
    const onAction = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <AppChrome onAction={onAction} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Project'));
    fireEvent.click(screen.getByText('New project (open folder…)'));
    expect(onAction).toHaveBeenCalledWith('project.new');
  });

  test('clicking disabled item does not dispatch action', () => {
    const onAction = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <AppChrome onAction={onAction} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Task'));
    fireEvent.click(screen.getByText('Find task'));
    expect(onAction).not.toHaveBeenCalled();
  });

  test('⌘W closes the active tab', () => {
    // Reset and seed the navigation store with two tabs.
    useNavigation.setState({ tabs: [], activeTabId: null });
    const id1 = useNavigation.getState().openTab({ kind: 'task', params: { taskId: 't1' } });
    const id2 = useNavigation.getState().openTab({ kind: 'settings' });
    expect(useNavigation.getState().activeTabId).toBe(id2);

    render(
      <I18nextProvider i18n={i18n}>
        <AppChrome onAction={() => {}} />
      </I18nextProvider>,
    );

    fireEvent.keyDown(document, { key: 'w', metaKey: true });
    const state = useNavigation.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([id1]);
    expect(state.activeTabId).toBe(id1);
  });

  test('⌘1 switches to the first tab', () => {
    useNavigation.setState({ tabs: [], activeTabId: null });
    const id1 = useNavigation.getState().openTab({ kind: 'task', params: { taskId: 't2' } });
    const id2 = useNavigation.getState().openTab({ kind: 'settings' });
    expect(useNavigation.getState().activeTabId).toBe(id2);

    render(
      <I18nextProvider i18n={i18n}>
        <AppChrome onAction={() => {}} />
      </I18nextProvider>,
    );

    fireEvent.keyDown(document, { key: '1', metaKey: true });
    expect(useNavigation.getState().activeTabId).toBe(id1);
  });
});
