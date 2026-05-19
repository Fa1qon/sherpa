import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MermaidBlock } from '../../../../src/presentation/fileviewer/mermaid/MermaidBlock';

describe('MermaidBlock', () => {
  // Skipped: mermaid's render() uses getBBox / DOM text-measurement APIs that
  // jsdom does not implement, so the promise never resolves under vitest's
  // jsdom environment. The component is exercised end-to-end via the .mmd
  // viewer integration tests (Plan 02 Task 3) and at runtime.
  it.skip('renders SVG output for a valid flowchart', async () => {
    const { container } = render(
      <MermaidBlock source={'flowchart LR\nA --> B'} />
    );
    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows error message on invalid syntax', async () => {
    const { findByRole } = render(
      <MermaidBlock source={'this is not mermaid'} />
    );
    const alert = await findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toBeTruthy();
  });

  // Skipped for the same reason as the first test — jsdom cannot complete
  // mermaid.render(), so re-render of valid sources cannot be observed.
  it.skip('re-renders when source changes', async () => {
    const { container, rerender } = render(
      <MermaidBlock source={'flowchart LR\nA --> B'} />
    );
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy(), { timeout: 5000 });
    const svg1 = container.querySelector('svg')!.outerHTML;

    rerender(<MermaidBlock source={'flowchart TD\nC --> D'} />);
    await waitFor(() => {
      const svg2 = container.querySelector('svg')!.outerHTML;
      expect(svg2).not.toBe(svg1);
    }, { timeout: 5000 });
  });
});
