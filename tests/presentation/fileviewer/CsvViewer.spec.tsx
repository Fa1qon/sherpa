import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CsvViewer } from '../../../src/presentation/fileviewer/CsvViewer';

describe('CsvViewer', () => {
  test('renders CSV as a table with header row', () => {
    const csv = 'Name,Age,City\nAlice,30,Moscow\nBob,25,Paris';
    render(<CsvViewer content={csv} ext="csv" />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]!.textContent).toBe('Name');
    expect(headers[1]!.textContent).toBe('Age');
    expect(headers[2]!.textContent).toBe('City');
    const cells = screen.getAllByRole('cell');
    expect(cells.some((c) => c.textContent === 'Alice')).toBe(true);
    expect(cells.some((c) => c.textContent === 'Bob')).toBe(true);
  });

  test('handles TSV with tab delimiter', () => {
    const tsv = 'A\tB\tC\n1\t2\t3';
    render(<CsvViewer content={tsv} ext="tsv" />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]!.textContent).toBe('A');
  });

  test('shows row count', () => {
    const csv = 'X,Y\na,b\nc,d\ne,f';
    render(<CsvViewer content={csv} ext="csv" />);
    expect(screen.getByText(/3.*строк|3.*rows/i)).toBeTruthy();
  });

  test('shows empty message for blank content', () => {
    render(<CsvViewer content="" ext="csv" />);
    expect(screen.getByText(/пусто|empty|нет данных/i)).toBeTruthy();
  });
});
