import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { AboutDialog } from '../../../src/presentation/components/AboutDialog';
import en from '../../../src/renderer/locales/en.json';

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

describe('AboutDialog', () => {
  test('renders version + license', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AboutDialog onClose={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.getByText(/About Sherpa/)).toBeInTheDocument();
    expect(screen.getByText('0.1.0-alpha.1')).toBeInTheDocument();
    expect(screen.getByText('Proprietary')).toBeInTheDocument();
  });

  test('clicking Close calls onClose', () => {
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <AboutDialog onClose={onClose} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('clicking inside dialog does not call onClose (only backdrop does)', () => {
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <AboutDialog onClose={onClose} />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByText('Version'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
