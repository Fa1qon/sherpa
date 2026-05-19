import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { useSettings } from '../../../../renderer/store/settings';
import { ipcClient } from '../../../../renderer/ipc/client';
import styles from './MobileWeb.module.css';

interface ServerStatus {
  running: boolean;
  port?: number;
  lanIp?: string;
}

function QrSvg({ value }: { value: string }): ReactElement {
  const [svg, setSvg] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', margin: 1, width: 220 })
      .then((s) => { if (!cancelled) setSvg(s); })
      .catch(() => { if (!cancelled) setSvg(''); });
    return () => { cancelled = true; };
  }, [value]);
  return <div className={styles.qr} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function MobileWeb(): ReactElement {
  const { t } = useTranslation();
  const mobileWeb = useSettings((s) => s.user.mobileWeb);
  const updateMobileWeb = useSettings((s) => s.updateMobileWeb);
  const [status, setStatus] = useState<ServerStatus>({ running: false });
  const [pin, setPin] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);

  const enabled = mobileWeb?.enabled ?? false;
  const port = mobileWeb?.port ?? 19223;

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const r = await ipcClient.mobileWeb().status();
        if (active) setStatus(r);
      } catch {
        if (active) setStatus({ running: false });
      }
    };
    void load();
    const id = window.setInterval(() => { void load(); }, 3000);
    return () => { active = false; window.clearInterval(id); };
  }, []);

  const toggleEnabled = async (v: boolean): Promise<void> => {
    setMessage(null);
    await updateMobileWeb({ enabled: v, port, pin: mobileWeb?.pin });
    try { await ipcClient.mobileWeb().restart(); } catch { /* server may not yet be reachable */ }
  };

  const setPortValue = async (n: number): Promise<void> => {
    setMessage(null);
    if (!Number.isFinite(n) || n < 1024 || n > 65535) return;
    await updateMobileWeb({ enabled, port: n, pin: mobileWeb?.pin });
    try { await ipcClient.mobileWeb().restart(); } catch { /* */ }
  };

  const submitPin = async (): Promise<void> => {
    if (!/^\d{4,8}$/.test(pin)) {
      setMessage(t('mobileWeb.pinError', 'PIN must be 4-8 digits'));
      return;
    }
    const res = await ipcClient.mobileWeb().setPin(pin);
    if (res.ok) {
      await updateMobileWeb({ enabled, port, pin });
      setPin('');
      setMessage(t('mobileWeb.pinUpdated', 'PIN updated'));
    } else {
      setMessage(res.error);
    }
  };

  const url = status.running && status.lanIp && status.port
    ? `http://${status.lanIp}:${status.port}`
    : null;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t('mobileWeb.title', 'Mobile Web')}</h2>

      <label className={styles.row}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => { void toggleEnabled(e.target.checked); }}
        />
        <span>{t('mobileWeb.enable', 'Enable mobile web interface')}</span>
      </label>

      <div className={styles.row}>
        <span>{t('mobileWeb.port', 'Port')}:</span>
        <input
          type="number"
          min={1024}
          max={65535}
          value={port}
          onChange={(e) => { void setPortValue(Number(e.target.value)); }}
        />
      </div>

      <div className={styles.row}>
        <span>{t('mobileWeb.pin', 'PIN')}:</span>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder={t('mobileWeb.pinPlaceholder', '4-8 digits')}
        />
        <button type="button" onClick={() => { void submitPin(); }}>
          {t('mobileWeb.setPin', 'Set PIN')}
        </button>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      {url && (
        <div className={styles.qrSection}>
          <div className={styles.urlBox}>{url}</div>
          <QrSvg value={url} />
          <p className={styles.hint}>{t('mobileWeb.hint', 'Scan from phone on the same Wi-Fi')}</p>
          <p className={styles.warn}>{t('mobileWeb.warn', 'Server listens on 0.0.0.0 — anyone on this Wi-Fi can reach it. Use a strong PIN.')}</p>
        </div>
      )}
    </section>
  );
}
