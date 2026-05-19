import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CsvViewer } from '../../../src/presentation/fileviewer/CsvViewer';

const SAMPLE = 'name,age,city\nAlice,30,NYC\nBob,25,SF\nCarol,40,LA';

describe('CsvViewer (enhanced)', () => {
  test('renders headers and data rows', () => {
    const csv = 'Name,Age,City\nAlice,30,Moscow\nBob,25,Paris';
    render(<CsvViewer content={csv} ext="csv" projectPath="/p" relPath="x.csv" />);
    const headers = screen.getAllByRole('columnheader');
    // includes the leading '#' row-number column
    expect(headers.length).toBeGreaterThanOrEqual(3);
    const headerTexts = headers.map((h) => h.textContent ?? '');
    expect(headerTexts.some((t) => t.includes('Name'))).toBe(true);
    expect(headerTexts.some((t) => t.includes('Age'))).toBe(true);
    expect(headerTexts.some((t) => t.includes('City'))).toBe(true);
  });

  test('handles TSV with tab delimiter', () => {
    const tsv = 'A\tB\tC\n1\t2\t3';
    render(<CsvViewer content={tsv} ext="tsv" projectPath="/p" relPath="x.tsv" />);
    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map((h) => h.textContent ?? '');
    expect(headerTexts.some((t) => t.includes('A'))).toBe(true);
    expect(headerTexts.some((t) => t.includes('B'))).toBe(true);
    expect(headerTexts.some((t) => t.includes('C'))).toBe(true);
  });

  test('shows row and column count', () => {
    const csv = 'X,Y\na,b\nc,d\ne,f';
    const { container } = render(
      <CsvViewer content={csv} ext="csv" projectPath="/p" relPath="x.csv" />,
    );
    const text = container.textContent ?? '';
    // meta shows "3 / 3 rows · 2 columns"
    expect(/3.*rows|3.*строк/i.test(text)).toBe(true);
    expect(/2.*columns|2.*колонок/i.test(text)).toBe(true);
  });

  test('shows empty message for blank content', () => {
    render(<CsvViewer content="" ext="csv" projectPath="/p" relPath="x.csv" />);
    expect(screen.getByText(/пусто|empty|нет данных|no data/i)).toBeTruthy();
  });

  test('renders search input in toolbar', () => {
    render(<CsvViewer content={SAMPLE} ext="csv" projectPath="/p" relPath="x.csv" />);
    const input = screen.getByPlaceholderText(/search|поиск/i);
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).tagName).toBe('INPUT');
  });

  test('filters by global search (best-effort under jsdom)', () => {
    const { container } = render(
      <CsvViewer content={SAMPLE} ext="csv" projectPath="/p" relPath="x.csv" />,
    );
    const input = screen.getByPlaceholderText(/search|поиск/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bob' } });
    // After filter, meta should report 1 row remaining of 3 total.
    const text = container.textContent ?? '';
    expect(/1\s*\/\s*3/.test(text)).toBe(true);
  });
});
