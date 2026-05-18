// src/presentation/screens/Settings/sections/Network.tsx
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useSettings } from '../../../../renderer/store/settings';
import type { ProxyEntry, ProxyAssignments } from '../../../../core/domain/proxy';
import { PROXY_TARGETS, DEFAULT_PROXY_ASSIGNMENTS } from '../../../../core/domain/proxy';
import { ProxyEntryDialog } from './ProxyEntryDialog';
import styles from './Network.module.css';

type DialogState =
  | { open: false }
  | { open: true; editing?: ProxyEntry };

export function Network(): ReactElement {
  const { t } = useTranslation();
  const entries = useSettings((s) => s.user.proxyEntries ?? []);
  const assignments = useSettings((s) => s.user.proxyAssignments ?? DEFAULT_PROXY_ASSIGNMENTS);
  const updateProxyEntries = useSettings((s) => s.updateProxyEntries);
  const updateProxyAssignments = useSettings((s) => s.updateProxyAssignments);

  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const handleSaveEntry = (entry: ProxyEntry): void => {
    const existing = entries.findIndex((e) => e.id === entry.id);
    const next =
      existing >= 0
        ? entries.map((e) => (e.id === entry.id ? entry : e))
        : [...entries, entry];
    void updateProxyEntries(next);
    setDialog({ open: false });
  };

  const handleDelete = (id: string): void => {
    const next = { ...assignments } as Record<string, string>;
    for (const tgt of PROXY_TARGETS) {
      if (next[tgt] === id) next[tgt] = 'direct';
    }
    void updateProxyEntries(entries.filter((e) => e.id !== id))
      .then(() => updateProxyAssignments(next as ProxyAssignments));
  };

  const handleAssignment = (target: string, value: string): void => {
    void updateProxyAssignments({ ...assignments, [target]: value } as ProxyAssignments);
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t('settings.network.title')}</h2>

      {/* Proxy Server List */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>{t('settings.network.proxyServers')}</span>
          <button
            type="button"
            className={styles.addBtn}
            data-testid="proxy-add-btn"
            onClick={() => setDialog({ open: true })}
          >
            <Plus size={14} />
            {t('settings.network.addProxy')}
          </button>
        </div>

        {entries.length === 0 ? (
          <p className={styles.empty} data-testid="proxy-empty">
            {t('settings.network.noProxies')}
          </p>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.entryRow}>
                <span className={styles.badge}>{entry.type.toUpperCase()}</span>
                <span className={styles.entryName}>{entry.name}</span>
                <span className={styles.entryHost}>{entry.host}:{entry.port}</span>
                <div className={styles.entryActions}>
                  <button type="button" aria-label={`Edit ${entry.name}`} onClick={() => setDialog({ open: true, editing: entry })}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" aria-label={`Delete ${entry.name}`} onClick={() => handleDelete(entry.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Traffic Routing */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>{t('settings.network.trafficRouting')}</span>
        </div>
        <table className={styles.routingTable}>
          <tbody>
            {PROXY_TARGETS.map((target) => (
              <tr key={target}>
                <td className={styles.targetLabel}>
                  {t(`settings.network.targets.${target}`)}
                </td>
                <td>
                  <select
                    value={assignments[target] ?? 'direct'}
                    onChange={(e) => handleAssignment(target, e.target.value)}
                    className={styles.routeSelect}
                  >
                    <option value="direct">{t('settings.network.direct')}</option>
                    {entries.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog.open && (
        <ProxyEntryDialog
          entry={dialog.editing}
          onSave={handleSaveEntry}
          onCancel={() => setDialog({ open: false })}
        />
      )}
    </section>
  );
}
