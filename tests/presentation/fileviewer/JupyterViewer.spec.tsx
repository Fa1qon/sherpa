// tests/presentation/fileviewer/JupyterViewer.spec.tsx
//
// Tests for the in-house Jupyter (.ipynb) renderer. The viewer uses
// react-markdown + ShikiCode internally — both are already in the bundle —
// so no @nteract/notebook-render-style version/legacy-React caveats apply.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JupyterViewer } from '../../../src/presentation/fileviewer/JupyterViewer';

const baseProps = {
  ext: 'ipynb',
  projectPath: '',
  relPath: 'x.ipynb',
};

function nb(cells: unknown[]): string {
  return JSON.stringify({
    cells,
    metadata: { kernelspec: { name: 'python3', language: 'python' } },
    nbformat: 4,
    nbformat_minor: 5,
  });
}

describe('JupyterViewer', () => {
  it('renders markdown cells', () => {
    const content = nb([{ cell_type: 'markdown', source: ['# Hello\n', '\n', 'World'], metadata: {} }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    expect(container.querySelector('h1')?.textContent).toBe('Hello');
    expect(container.textContent).toContain('World');
  });

  it('renders code cells with execution count', () => {
    const content = nb([{
      cell_type: 'code',
      source: 'print(1)',
      execution_count: 3,
      outputs: [],
      metadata: {},
    }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    expect(container.textContent).toContain('[3]:');
    expect(container.textContent).toContain('print(1)');
  });

  it('renders stream stdout output', () => {
    const content = nb([{
      cell_type: 'code',
      source: 'print("hi")',
      execution_count: 1,
      outputs: [{ output_type: 'stream', name: 'stdout', text: 'hi\n' }],
      metadata: {},
    }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    expect(container.textContent).toContain('hi');
  });

  it('renders stream stderr', () => {
    const content = nb([{
      cell_type: 'code',
      source: 'warn()',
      execution_count: 1,
      outputs: [{ output_type: 'stream', name: 'stderr', text: 'warning!' }],
      metadata: {},
    }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    expect(container.textContent).toContain('warning!');
  });

  it('renders error tracebacks with ANSI stripped', () => {
    const content = nb([{
      cell_type: 'code',
      source: '1/0',
      execution_count: 1,
      outputs: [{
        output_type: 'error',
        ename: 'ZeroDivisionError',
        evalue: 'division by zero',
        traceback: ['[0;31mZeroDivisionError[0m: division by zero'],
      }],
      metadata: {},
    }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    expect(container.textContent).toContain('ZeroDivisionError');
    expect(container.textContent).toContain('division by zero');
    expect(container.textContent).not.toContain('');
    expect(container.textContent).not.toContain('[0;31m');
  });

  it('renders image/png output as data URL', () => {
    const content = nb([{
      cell_type: 'code',
      source: 'plt.show()',
      execution_count: 1,
      outputs: [{
        output_type: 'display_data',
        data: { 'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=' },
      }],
      metadata: {},
    }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.src.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('renders text/plain output', () => {
    const content = nb([{
      cell_type: 'code',
      source: 'x',
      execution_count: 1,
      outputs: [{
        output_type: 'execute_result',
        data: { 'text/plain': '42' },
      }],
      metadata: {},
    }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    expect(container.textContent).toContain('42');
  });

  it('shows parse error for invalid JSON', () => {
    const { getByRole, container } = render(<JupyterViewer content={'not json'} {...baseProps} />);
    expect(getByRole('alert')).toBeTruthy();
    expect(container.textContent?.toLowerCase()).toMatch(/parse|json/);
  });

  it('shows error for missing cells array', () => {
    const { getByRole } = render(<JupyterViewer content={'{"nbformat":4}'} {...baseProps} />);
    expect(getByRole('alert')).toBeTruthy();
  });

  it('handles array-form source by joining lines', () => {
    const content = nb([{ cell_type: 'markdown', source: ['line1\n', 'line2'], metadata: {} }]);
    const { container } = render(<JupyterViewer content={content} {...baseProps} />);
    expect(container.textContent).toContain('line1');
    expect(container.textContent).toContain('line2');
  });
});
