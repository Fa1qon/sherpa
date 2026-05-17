import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { ActivityBar } from '../../../src/presentation/chrome/ActivityBar';
import { useNavigation } from '../../../src/renderer/store/navigation';
import { useSideBar } from '../../../src/renderer/store/sidebar';
import en from '../../../src/renderer/locales/en.json';

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

beforeEach(() => {
  useNavigation.setState({ tabs: [], activeTabId: null });
  useSideBar.setState({ activity: null, width: 280 });
});

describe('ActivityBar', () => {
  test('renders 4 nav buttons (files + tasks + library + settings)', () => {
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    expect(screen.getByTitle('Files')).toBeInTheDocument();
    expect(screen.getByTitle('Tasks')).toBeInTheDocument();
    expect(screen.getByTitle('Library')).toBeInTheDocument();
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
  });

  test('buttons expose accessible name via aria-label', () => {
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    expect(screen.getByRole('button', { name: 'Tasks' })).toBeInTheDocument();
  });

  test('clicking library toggles sidebar activity to "library"', () => {
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    fireEvent.click(screen.getByTitle('Library'));
    expect(useSideBar.getState().activity).toBe('library');
  });

  test('settings button is active when sidebar activity is "settings"', () => {
    useSideBar.setState({ activity: 'settings' });
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    const btn = screen.getByTitle('Settings');
    expect(btn).toHaveAttribute('data-active', 'true');
  });

  test('clicking files icon toggles sidebar activity to "files"', () => {
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    fireEvent.click(screen.getByTitle('Files'));
    expect(useSideBar.getState().activity).toBe('files');
  });

  test('clicking files icon again collapses sidebar (toggle to null)', () => {
    useSideBar.setState({ activity: 'files' });
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    fireEvent.click(screen.getByTitle('Files'));
    expect(useSideBar.getState().activity).toBeNull();
  });

  test('files button is active when sidebar activity is "files"', () => {
    useSideBar.setState({ activity: 'files' });
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    const filesBtn = screen.getByTitle('Files');
    expect(filesBtn).toHaveAttribute('data-active', 'true');
  });

  test('files button is inactive when sidebar is null', () => {
    render(<I18nextProvider i18n={i18n}><ActivityBar /></I18nextProvider>);
    const filesBtn = screen.getByTitle('Files');
    expect(filesBtn).toHaveAttribute('data-active', 'false');
  });
});
