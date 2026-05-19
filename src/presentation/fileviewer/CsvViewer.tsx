// src/presentation/fileviewer/CsvViewer.tsx
import { useMemo, useState, useRef, type ReactElement } from 'react';
import Papa from 'papaparse';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ViewerProps } from './viewer_registry';
import styles from './CsvViewer.module.css';

type Row = Record<string, string>;

export function CsvViewer({ content, ext }: ViewerProps): ReactElement {
  const { t } = useTranslation();

  const { headers, data } = useMemo(() => {
    if (!content.trim()) return { headers: [] as string[], data: [] as Row[] };
    const result = Papa.parse<string[]>(content, {
      skipEmptyLines: true,
      delimiter: ext.toLowerCase() === 'tsv' ? '\t' : '',
    });
    const all = result.data as string[][];
    const h = all[0] ?? [];
    const rows = all.slice(1).map<Row>((r) => {
      const obj: Row = {};
      h.forEach((col, i) => {
        obj[col] = r[i] ?? '';
      });
      return obj;
    });
    return { headers: h, data: rows };
  }, [content, ext]);

  const columnHelper = useMemo(() => createColumnHelper<Row>(), []);
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      headers.map((h) =>
        columnHelper.accessor((row) => row[h], {
          id: h,
          header: h,
          cell: (info) => info.getValue() as string,
        }),
      ) as ColumnDef<Row>[],
    [headers, columnHelper],
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _id, value: string) => {
      if (!value) return true;
      const needle = value.toLowerCase();
      return Object.values(row.original).some((v) =>
        String(v).toLowerCase().includes(needle),
      );
    },
  });

  const rows = table.getRowModel().rows;
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 28,
    overscan: 12,
  });

  if (headers.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>{t('fileviewer.csvEmpty', 'Нет данных')}</div>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom = Math.max(
    0,
    rowVirtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0),
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder={t('fileviewer.csvSearch', 'Поиск…')}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <div className={styles.meta}>
          {rows.length} / {data.length} {t('fileviewer.csvRows', 'rows')} ·{' '}
          {headers.length} {t('fileviewer.csvCols', 'columns')}
        </div>
      </div>

      <div ref={tableContainerRef} className={styles.tableScroll}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className={styles.rowNumHead}>#</th>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={styles.th}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </span>
                    <span className={styles.sortIndicator}>
                      {header.column.getIsSorted() === 'asc'
                        ? ' ▲'
                        : header.column.getIsSorted() === 'desc'
                          ? ' ▼'
                          : ''}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr style={{ height: paddingTop }}>
                <td colSpan={headers.length + 1} />
              </tr>
            )}
            {virtualItems.map((vi) => {
              const row = rows[vi.index]!;
              return (
                <tr key={row.id} style={{ height: vi.size }}>
                  <td className={styles.rowNum}>{vi.index + 1}</td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={styles.td}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr style={{ height: paddingBottom }}>
                <td colSpan={headers.length + 1} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
