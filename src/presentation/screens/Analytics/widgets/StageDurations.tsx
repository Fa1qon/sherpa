import { useEffect, useState, type ReactElement } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ipcClient } from '../../../../renderer/ipc/client';
import type { StageDurationEntry } from '../../../../core/domain/observability';

export function StageDurations({ reloadKey }: { reloadKey: number }): ReactElement {
  const { t } = useTranslation();
  const [rows, setRows] = useState<StageDurationEntry[]>([]);

  useEffect(() => {
    let ignore = false;
    void ipcClient.observability().stageDurations().then((r) => {
      if (!ignore) setRows(r);
    });
    return () => { ignore = true; };
  }, [reloadKey]);

  return (
    <>
      <h3>{t('analytics.stageDurations', 'Stage durations (ms)')}</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)' }}>{t('analytics.noData', 'No data')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows}>
            <XAxis dataKey="stageId" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="avgMs" fill="#0066cc" name="avg" />
            <Bar dataKey="p95" fill="#ff9f0a" name="p95" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </>
  );
}
