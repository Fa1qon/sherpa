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
  const rawEntries = useSettings((s) => s.user.proxyEntries);
  const entries = rawEntries ?? [];
  const rawAssignments = useSettings((s) => s.user.proxyAssignments);
  const assignments = rawAssignments ?? DEFAULT_PROXY_ASSIGNMENTS;
  const updateProxyEntries = useSettings((s) => s.updateProxyEntries);
  const updateProxyAssignments = useSettings((s) => s.updateProxyAssignments);
  const inboundTriggerPort = useSettings((s) => s.user.inboundTriggerPort);
  const setInboundTriggerPort = useSettings((s) => s.setInboundTriggerPort);

  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [portInput, setPortInput] = useState<string>(
    inboundTriggerPort === undefined ? '19222' : String(inboundTriggerPort),
  );

  const handlePortBlur = (): void => {
    const trimmed = portInput.trim();
    if (trimmed === '') {
      void setInboundTriggerPort(undefined);
      setPortInput('19222');
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0 || n > 65535 || (n !== 0 && n < 1024)) {
      // Reset to current valid value on invalid input.
      setPortInput(inboundTriggerPort === undefined ? '19222' : String(inboundTriggerPort));
      return;
    }
    void setInboundTriggerPort(n);
  };

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

      {/* Inbound trigger port (Track C Plan 04) */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>{t('settings.network.inboundTriggerPort')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min={0}
            max={65535}
            step={1}
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onBlur={handlePortBlur}
            data-testid="inbound-trigger-port-input"
            style={{ width: 120 }}
          />
          <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
            {t('settings.network.inboundTriggerPortHint')}
          </span>
        </div>
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
