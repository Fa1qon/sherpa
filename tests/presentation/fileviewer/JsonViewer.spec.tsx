import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { JsonViewer } from '../../../src/presentation/fileviewer/JsonViewer';
import en from '../../../src/renderer/locales/en.json';

// Mock CodeMirror — heavy, not needed for assertions about source-mode toggle
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      data-testid="codemirror"
      className="cm-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

// react-json-view-lite ships a CSS import; jsdom can handle it through vite's css plugin,
// but defensively stub the module if env issues arise. (Real module preferred.)

i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

const wrap = (ui: React.ReactElement): React.ReactElement => (
  <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
);

describe('JsonViewer', () => {
  test('renders parsed JSON in tree mode', () => {
    const { container } = render(
      wrap(<JsonViewer content={'{"a": 1, "b": "hello"}'} ext="json" projectPath="" relPath="x.json" />),
    );
    const text = container.textContent ?? '';
    expect(/\ba\b/.test(text)).toBe(true);
    expect(/hello/.test(text)).toBe(true);
  });

  test('shows parse error for invalid JSON', () => {
    const { getByRole } = render(
      wrap(<JsonViewer content={'not json'} ext="json" projectPath="" relPath="x.json" />),
    );
    expect(getByRole('alert')).toBeTruthy();
  });

  test('toggles to source mode', () => {
    const { getByText, container } = render(
      wrap(<JsonViewer content={'{"a":1}'} ext="json" projectPath="" relPath="x.json" />),
    );
    fireEvent.click(getByText(/source|источник/i));
    expect(container.querySelector('.cm-editor')).toBeTruthy();
  });
});
