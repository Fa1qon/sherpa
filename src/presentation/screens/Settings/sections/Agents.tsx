import { useState, useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentCli } from '../../../../core/domain/settings';
import styles from './Agents.module.css';

const API_KEY_AGENTS: AgentCli[] = ['codex', 'gemini', 'amp', 'cursor', 'qwen-code', 'kimi'];
const OAUTH_AGENTS: AgentCli[] = ['copilot', 'goose'];
const LOCAL_AGENTS: AgentCli[] = ['pi', 'opencode', 'aider'];

type AuthStatus = { hasCredential: false } | { hasCredential: true; type: 'apikey' | 'oauth' };

interface AgentRowProps {
  readonly agentId: AgentCli;
  readonly isOAuth: boolean;
  readonly isLocal: boolean;
}

function AgentRow({ agentId, isOAuth, isLocal }: AgentRowProps): ReactElement {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.sherpa.agent.authStatus(agentId).then(setStatus);
  }, [agentId]);

  const handleSaveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await window.sherpa.agent.storeKey(agentId, keyInput.trim());
      setKeyInput('');
      const next = await window.sherpa.agent.authStatus(agentId);
      setStatus(next);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (): Promise<void> => {
    await window.sherpa.agent.revoke(agentId);
    const next = await window.sherpa.agent.authStatus(agentId);
    setStatus(next);
  };

  const statusLabel = status === null
    ? '…'
    : status.hasCredential
      ? t('settings.agents.statusSet', { type: status.type })
      : t('settings.agents.statusNotSet');

  const statusClass = status?.hasCredential ? styles.statusOk : styles.statusMissing;

  return (
    <div className={styles.agentRow}>
      <span className={styles.agentName}>{agentId}</span>
      <span className={`${styles.status} ${statusClass}`}>{statusLabel}</span>
      {isLocal && <span className={styles.status}>{t('settings.agents.noKeyNeeded')}</span>}
      {!isLocal && !isOAuth && (
        <>
          <input
            className={styles.input}
            type="password"
            placeholder={t('settings.agents.keyPlaceholder')}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button className={styles.btn} disabled={saving || !keyInput.trim()} onClick={() => void handleSaveKey()}>
            {t('settings.agents.save')}
          </button>
        </>
      )}
      {isOAuth && <span className={styles.status}>{t('settings.agents.oauthNote')}</span>}
      {status?.hasCredential && (
        <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => void handleRevoke()}>
          {t('settings.agents.revoke')}
        </button>
      )}
    </div>
  );
}

export function Agents(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className={styles.section}>
      <h3>{t('settings.section.agents')}</h3>
      <p>{t('settings.agents.description')}</p>
      {API_KEY_AGENTS.map((id) => <AgentRow key={id} agentId={id} isOAuth={false} isLocal={false} />)}
      {OAUTH_AGENTS.map((id) => <AgentRow key={id} agentId={id} isOAuth={true} isLocal={false} />)}
      {LOCAL_AGENTS.map((id) => <AgentRow key={id} agentId={id} isOAuth={false} isLocal={true} />)}
    </section>
  );
}
