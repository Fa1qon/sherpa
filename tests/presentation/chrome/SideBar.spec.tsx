import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { SideBar } from '../../../src/presentation/chrome/SideBar';
import { useSideBar } from '../../../src/renderer/store/sidebar';
import { useProject } from '../../../src/renderer/store/project';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

beforeEach(() => {
  useSideBar.setState({ activity: null, width: 280 });
  useProject.setState({ current: null, recent: [], busy: false, error: null });
});

describe('SideBar', () => {
  test('returns null when activity is null', () => {
    const { container } = renderWithI18n(<SideBar />);
    expect(container.querySelector('aside')).toBeNull();
  });

  test('renders aside with header when activity is "files"', () => {
    useSideBar.setState({ activity: 'files' });
    renderWithI18n(<SideBar />);
    expect(document.querySelector('aside')).not.toBeNull();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  test('applies width style from store', () => {
    useSideBar.setState({ activity: 'files', width: 320 });
    renderWithI18n(<SideBar />);
    const aside = document.querySelector('aside') as HTMLElement;
    expect(aside.style.width).toBe('320px');
  });

  test('renders "library" header for activity=library', () => {
    useSideBar.setState({ activity: 'library' });
    renderWithI18n(<SideBar />);
    expect(screen.getByText('Library')).toBeInTheDocument();
  });

  test('renders "settings" header for activity=settings', () => {
    useSideBar.setState({ activity: 'settings' });
    renderWithI18n(<SideBar />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
