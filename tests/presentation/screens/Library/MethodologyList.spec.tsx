// Plan 8b Task 1 — MethodologyList must NOT expose an Import button
import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { MethodologyList } from '../../../../src/presentation/screens/Library/MethodologyList';
import { useMethodology } from '../../../../src/renderer/store/methodology';
import en from '../../../../src/renderer/locales/en.json';

// NewMethodologyDialog uses portals / window.sherpa — mock it to keep this test minimal
vi.mock('../../../../src/presentation/screens/Library/NewMethodologyDialog', () => ({
  NewMethodologyDialog: () => null,
}));

i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

beforeEach(() => {
  useMethodology.setState({
    list: [],
    selectedId: null,
    current: null,
    loading: false,
    error: null,
    mode: 'view',
    draft: null,
    dirty: false,
    history: { past: [], future: [] },
  });
});

test('MethodologyList does not render an Import button', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <MethodologyList />
    </I18nextProvider>,
  );

  // There must be no button whose accessible text matches /import/i
  const buttons = screen.queryAllByRole('button', { name: /import/i });
  expect(buttons).toHaveLength(0);
});
