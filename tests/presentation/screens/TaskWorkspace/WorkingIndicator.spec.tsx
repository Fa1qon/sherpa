// tests/presentation/screens/TaskWorkspace/WorkingIndicator.spec.tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { WorkingIndicator } from '../../../../src/presentation/screens/TaskWorkspace/WorkingIndicator';
import en from '../../../../src/renderer/locales/en.json';

if (!i18n.isInitialized) {
  void i18n.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
}

describe('WorkingIndicator', () => {
  test('renders all four counters when linesWritten > 0', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <WorkingIndicator counters={{ toolUses: 3, elapsedSec: 12, estTokens: 1500, linesWritten: 45, lastToolName: null }} />
      </I18nextProvider>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    // toLocaleString() output varies by jsdom locale (',' vs ' ' vs NBSP
    // grouping separator). Read the indicator's full text and normalize.
    const text = (screen.getByRole('status').textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/3 tools/);
    expect(text).toMatch(/12s/);
    expect(text).toMatch(/≈\s*1[ ,]?500 tokens/);
    expect(text).toMatch(/45 lines/);
  });

  test('hides lines counter when linesWritten === 0', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <WorkingIndicator counters={{ toolUses: 1, elapsedSec: 1, estTokens: 100, linesWritten: 0, lastToolName: null }} />
      </I18nextProvider>,
    );
    const text = (screen.getByRole('status').textContent ?? '').replace(/\s+/g, ' ');
    expect(text).not.toMatch(/lines|строк/);
  });
});
