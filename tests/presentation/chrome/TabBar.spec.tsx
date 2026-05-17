import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { TabBar } from '../../../src/presentation/chrome/TabBar';
import { AppChrome } from '../../../src/presentation/chrome/AppChrome';
import { useNavigation } from '../../../src/renderer/store/navigation';
import { useRightSidebar } from '../../../src/renderer/store/right_sidebar';
import { usePanelRegistry } from '../../../src/renderer/store/panel_registry';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

beforeEach(() => {
  useNavigation.setState({ tabs: [], activeTabId: null });
  useRightSidebar.setState({ isOpen: false });
  usePanelRegistry.setState({ contributions: [] });
});

describe('TabBar', () => {
  test('renders null when no tabs', () => {
    const { container } = render(<I18nextProvider i18n={i18n}><TabBar /></I18nextProvider>);
    expect(container.firstChild).toBeNull();
  });

  test('renders one tab per state.tabs and highlights active', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'tbar' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    render(<I18nextProvider i18n={i18n}><TabBar /></I18nextProvider>);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[1]!).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]!).toHaveAttribute('aria-selected', 'false');
  });

  test('click switches active', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'tbar' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    render(<I18nextProvider i18n={i18n}><TabBar /></I18nextProvider>);
    fireEvent.click(screen.getAllByRole('tab')[0]!);
    expect(screen.getAllByRole('tab')[0]!).toHaveAttribute('aria-selected', 'true');
  });

  test('close button closes tab', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'tbar' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    render(<I18nextProvider i18n={i18n}><TabBar /></I18nextProvider>);
    fireEvent.click(screen.getAllByLabelText('Close tab')[0]!);
    expect(useNavigation.getState().tabs).toHaveLength(1);
  });

  test('dirty tab triggers onCloseDirty before closing', () => {
    useNavigation.getState().openTab({ kind: 'methodology-editor', params: { id: 'a' } });
    const id = useNavigation.getState().tabs[0]!.id;
    useNavigation.getState().markDirty(id, true);
    const onCloseDirty = vi.fn().mockReturnValue(false);
    render(<I18nextProvider i18n={i18n}><TabBar onCloseDirty={onCloseDirty} /></I18nextProvider>);
    fireEvent.click(screen.getByLabelText('Close tab'));
    expect(onCloseDirty).toHaveBeenCalled();
    expect(useNavigation.getState().tabs).toHaveLength(1);
  });

  test('context menu appears on right-click', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 't1' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    render(<I18nextProvider i18n={i18n}><TabBar /></I18nextProvider>);
    const tab = screen.getAllByRole('tab')[0]!;
    fireEvent.contextMenu(tab);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  test('context menu close-others removes other tabs', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 't1' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    useNavigation.getState().openTab({ kind: 'project-settings' });
    render(<I18nextProvider i18n={i18n}><TabBar /></I18nextProvider>);
    // right-click first tab
    fireEvent.contextMenu(screen.getAllByRole('tab')[0]!);
    const menuItems = screen.getAllByRole('menuitem');
    const closeOthers = menuItems.find((el) => el.textContent?.includes('остальные') || el.textContent?.includes('Others'));
    expect(closeOthers).toBeTruthy();
    fireEvent.click(closeOthers!);
    expect(useNavigation.getState().tabs).toHaveLength(1);
  });

  test('drag reorders tabs', () => {
    useNavigation.getState().openTab({ kind: 'task', params: { taskId: 'first' } });
    useNavigation.getState().openTab({ kind: 'settings' });
    const initialIds = useNavigation.getState().tabs.map((t) => t.id);
    render(<I18nextProvider i18n={i18n}><TabBar /></I18nextProvider>);
    const tabEls = screen.getAllByRole('tab');
    fireEvent.dragStart(tabEls[0]!);
    fireEvent.dragOver(tabEls[1]!);
    fireEvent.drop(tabEls[1]!);
    const reorderedIds = useNavigation.getState().tabs.map((t) => t.id);
    // After drag from 0 to 1, order should be reversed
    expect(reorderedIds[0]).toBe(initialIds[1]);
    expect(reorderedIds[1]).toBe(initialIds[0]);
  });

  test('right-panel toggle button appears in AppChrome when active tab has panel contribution', () => {
    useNavigation.getState().openTab({ kind: 'settings' });
    const { id: tabId, kind } = useNavigation.getState().tabs[0]!;
    usePanelRegistry.getState().register({
      id: 'test-right',
      slot: `sidebar.right:${kind}`,
      component: () => null,
    });
    useNavigation.setState({ activeTabId: tabId });
    render(<I18nextProvider i18n={i18n}><AppChrome onAction={vi.fn()} /></I18nextProvider>);
    const toggleBtn = screen.getByLabelText(/right panel/i);
    expect(toggleBtn).toBeTruthy();
  });
});
