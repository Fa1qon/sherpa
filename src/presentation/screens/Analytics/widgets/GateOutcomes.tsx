import { useEffect, useState, type ReactElement } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { ipcClient } from '../../../../renderer/ipc/client';
import type { GateOutcomeEntry } from '../../../../core/domain/observability';

export function GateOutcomes({ reloadKey }: { reloadKey: number }): ReactElement {
  const { t } = useTranslation();
  const [rows, setRows] = useState<GateOutcomeEntry[]>([]);

  useEffect(() => {
    let ignore = false;
    void ipcClient.observability().gateOutcomes().then((r) => {
      if (!ignore) setRows(r);
    });
    return () => { ignore = true; };
  }, [reloadKey]);

  return (
    <>
      <h3>{t('analytics.gateOutcomes', 'Gate pass / fail / pending')}</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)' }}>{t('analytics.noData', 'No data')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows}>
            <XAxis dataKey="gateId" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="pass" stackId="a" fill="#00997a" />
            <Bar dataKey="fail" stackId="a" fill="#d70015" />
            <Bar dataKey="pending" stackId="a" fill="#ff9f0a" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </>
  );
}
