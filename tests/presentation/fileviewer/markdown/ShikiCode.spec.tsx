import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ShikiCode } from '../../../../src/presentation/fileviewer/markdown/ShikiCode';

describe('ShikiCode', () => {
  it('renders highlighted HTML for known language', async () => {
    const { container } = render(<ShikiCode lang="javascript" code="const x = 1" theme="dark" />);
    await waitFor(
      () => {
        expect(container.querySelector('pre')).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it('falls back to plain code for unknown lang', async () => {
    const { container } = render(<ShikiCode lang="klingon" code="qa'pla" theme="dark" />);
    await waitFor(() => {
      expect(container.textContent).toContain("qa'pla");
    });
  });
});
