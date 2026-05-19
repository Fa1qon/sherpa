// src/presentation/screens/Settings/sections/Extensions.tsx
// Extension Framework Plan 05 Task 5 — Extension Manager UI.
//
// Lists every installed extension with a toggle to enable/disable, an
// install button that opens a native file picker (.zip / .sherpa-ext),
// and a per-row uninstall button. All operations route through
// `window.sherpa.extensions.*` (see preload + extension_handlers).

import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { ipcClient } from '../../../../renderer/ipc/client';
import styles from './Extensions.module.css';

interface ExtListItem {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  hasMain: boolean;
  hasRenderer: boolean;
}

export function Extensions(): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<ExtListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async (): Promise<void> => {
    try {
      const list = (await ipcClient.extensions().list()) as ExtListItem[];
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const toggle = async (id: string, enabled: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) await ipcClient.extensions().enable(id);
      else await ipcClient.extensions().disable(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const installFromZip = async (): Promise<void> => {
    setError(null);
    const zipPath = await ipcClient.extensions().pickZip();
    if (!zipPath) return;
    setBusy(true);
    try {
      const result = await ipcClient.extensions().installZip(zipPath);
      if (!result.ok) {
        setError(`Install failed: ${result.errors?.join('; ') ?? 'unknown error'}`);
      } else {
        await reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async (id: string): Promise<void> => {
    // eslint-disable-next-line no-alert
    if (!confirm(t('extensions.uninstallConfirm', { id }))) return;
    setBusy(true);
    setError(null);
    try {
      await ipcClient.extensions().uninstall(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>{t('extensions.title')}</h2>
        <button
          type="button"
          className={styles.installBtn}
          onClick={() => void installFromZip()}
          disabled={busy}
        >
          <Plus size={14} />
          {t('extensions.install')}
        </button>
      </div>
      {error && (
        <div role="alert" style={{ color: 'var(--error)', fontSize: 12 }}>
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <p className={styles.empty}>{t('extensions.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((ext) => (
            <li key={ext.id} className={styles.row}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={ext.enabled}
                  onChange={(e) => void toggle(ext.id, e.target.checked)}
                  disabled={busy}
                  aria-label={`${ext.name} enabled`}
                />
              </label>
              <div className={styles.info}>
                <div className={styles.name}>
                  {ext.name}
                  <span className={styles.version}>v{ext.version}</span>
                </div>
                {ext.description && (
                  <div className={styles.desc}>{ext.description}</div>
                )}
                <div className={styles.id}>{ext.id}</div>
              </div>
              <button
                type="button"
                className={styles.removeBtn}
                aria-label={t('extensions.uninstall')}
                onClick={() => void uninstall(ext.id)}
                disabled={busy}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
