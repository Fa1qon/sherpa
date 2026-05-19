import { useEffect, useState, type ReactElement } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ipcClient } from '../../../../renderer/ipc/client';
import type { ToolUsageEntry } from '../../../../core/domain/observability';

export function ToolUsage({ reloadKey }: { reloadKey: number }): ReactElement {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ToolUsageEntry[]>([]);

  useEffect(() => {
    let ignore = false;
    void ipcClient.observability().toolUsage().then((r) => {
      if (!ignore) setRows(r);
    });
    return () => { ignore = true; };
  }, [reloadKey]);

  return (
    <>
      <h3>{t('analytics.tools', 'Tool usage')}</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)' }}>{t('analytics.noData', 'No data')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} layout="vertical">
            <XAxis type="number" />
            <YAxis dataKey="toolName" type="category" width={80} />
            <Tooltip />
            <Bar dataKey="calls" fill="#0066cc" name={t('analytics.tools', 'calls')} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </>
  );
}
