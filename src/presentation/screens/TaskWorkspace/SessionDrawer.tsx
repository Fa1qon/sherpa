import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentMessage } from '../../../core/domain/agent';
import styles from './SessionDrawer.module.css';

interface Props {
  readonly messages: readonly AgentMessage[];
  readonly onClose: () => void;
}

export function SessionDrawer({ messages, onClose }: Props): ReactElement {
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="session-drawer-overlay">
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()} data-testid="session-drawer">
        <div className={styles.header}>
          <span className={styles.title}>{t('chat.sessionDrawer', 'Session')}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            {t('chat.closeDrawer', 'Close')}
          </button>
        </div>
        <div className={styles.body}>
          {messages.length === 0 && (
            <span className={styles.emptyHint}>{t('chat.noMessages', 'No messages yet.')}</span>
          )}
          {messages.map((m) => (
            <DrawerMessage key={m.id} message={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DrawerMessage({ message: m }: { readonly message: AgentMessage }): ReactElement {
  if (m.role === 'tool' && m.toolCall) {
    const args = JSON.stringify(m.toolCall.args, null, 2);
    return (
      <div className={styles.toolBlock}>
        <div className={styles.toolHeader}>
          [{m.toolCall.status}] {m.toolCall.name}
        </div>
        <div>{args}</div>
        {m.toolCall.result !== undefined && (
          <div className={styles.toolResult}>{m.toolCall.result}</div>
        )}
      </div>
    );
  }
  return (
    <div className={styles.toolBlock} data-role={m.role}>
      <div className={styles.toolHeader}>{m.role}</div>
      <div>{m.text}</div>
    </div>
  );
}
