// src/presentation/screens/Settings/sections/ProxyEntryDialog.tsx
import { useState, type ReactElement, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProxyEntry, ProxyType } from '../../../../core/domain/proxy';
import styles from './ProxyEntryDialog.module.css';

interface Props {
  entry?: ProxyEntry;   // undefined = new entry
  onSave(entry: ProxyEntry): void;
  onCancel(): void;
}

const TYPES: ProxyType[] = ['http', 'https', 'socks5'];

function newId(): string { return crypto.randomUUID(); }

export function ProxyEntryDialog({ entry, onSave, onCancel }: Props): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState(entry?.name ?? '');
  const [type, setType] = useState<ProxyType>(entry?.type ?? 'http');
  const [host, setHost] = useState(entry?.host ?? '');
  const [port, setPort] = useState(String(entry?.port ?? '8080'));
  const [useAuth, setUseAuth] = useState(!!entry?.username);
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState(entry?.password ?? '');
  const [noProxy, setNoProxy] = useState(entry?.noProxy ?? '');

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const portNum = Number.parseInt(port, 10);
    if (!name.trim() || !host.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) return;
    if (useAuth && !username.trim()) return;
    onSave({
      id: entry?.id ?? newId(),
      name: name.trim(),
      type,
      host: host.trim(),
      port: portNum,
      ...(useAuth && username.trim() ? { username: username.trim(), password } : {}),
      ...(noProxy.trim() ? { noProxy: noProxy.trim() } : {}),
    });
  };

  const title = entry
    ? t('settings.network.entryDialog.editTitle')
    : t('settings.network.entryDialog.addTitle');

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <h3 className={styles.title}>{title}</h3>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>{t('settings.network.entryDialog.name')}</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className={styles.field}>
            <span>{t('settings.network.entryDialog.type')}</span>
            <select value={type} onChange={(e) => setType(e.target.value as ProxyType)}>
              {TYPES.map((tp) => <option key={tp} value={tp}>{tp.toUpperCase()}</option>)}
            </select>
          </label>

          <div className={styles.row}>
            <label className={styles.field} style={{ flex: 1 }}>
              <span>{t('settings.network.entryDialog.host')}</span>
              <input required value={host} onChange={(e) => setHost(e.target.value)} placeholder="proxy.example.com" />
            </label>
            <label className={styles.field} style={{ width: 90 }}>
              <span>{t('settings.network.entryDialog.port')}</span>
              <input required type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
          </div>

          <label className={styles.checkRow}>
            <input type="checkbox" checked={useAuth} onChange={(e) => setUseAuth(e.target.checked)} />
            {t('settings.network.entryDialog.auth')}
          </label>

          {useAuth && (
            <div className={styles.row}>
              <label className={styles.field} style={{ flex: 1 }}>
                <span>{t('settings.network.entryDialog.username')}</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>
              <label className={styles.field} style={{ flex: 1 }}>
                <span>{t('settings.network.entryDialog.password')}</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            </div>
          )}

          <label className={styles.field}>
            <span>{t('settings.network.entryDialog.noProxy')}</span>
            <input
              value={noProxy}
              onChange={(e) => setNoProxy(e.target.value)}
              placeholder={t('settings.network.entryDialog.noProxyHint')}
            />
          </label>

          <div className={styles.actions}>
            <button type="button" onClick={onCancel}>{t('settings.network.entryDialog.cancel')}</button>
            <button type="submit" className={styles.primary}>{t('settings.network.entryDialog.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
