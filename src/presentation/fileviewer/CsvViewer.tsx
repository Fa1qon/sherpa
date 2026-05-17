// src/presentation/fileviewer/CsvViewer.tsx
import { useMemo, type ReactElement } from 'react';
import Papa from 'papaparse';
import { useTranslation } from 'react-i18next';
import styles from './CsvViewer.module.css';

interface Props {
  content: string;
  ext: string;
}

export function CsvViewer({ content, ext }: Props): ReactElement {
  const { t } = useTranslation();

  const { headers, rows } = useMemo(() => {
    if (!content.trim()) return { headers: [], rows: [] };
    const result = Papa.parse<string[]>(content, {
      skipEmptyLines: true,
      delimiter: ext.toLowerCase() === 'tsv' ? '\t' : '',
    });
    const all = result.data as string[][];
    const h = all[0] ?? [];
    const r = all.slice(1);
    return { headers: h, rows: r };
  }, [content, ext]);

  if (headers.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>{t('fileviewer.csvEmpty', 'Нет данных')}</div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        {rows.length} {t('fileviewer.csvRows', 'rows')}
        {' · '}
        {headers.length} {t('fileviewer.csvCols', 'columns')}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <td className={styles.rowNum} aria-label="Row number">#</td>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td className={styles.rowNum}>{ri + 1}</td>
                {headers.map((_, ci) => (
                  <td key={ci}>{row[ci] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
