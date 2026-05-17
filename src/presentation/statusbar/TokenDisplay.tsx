import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useTask } from '../../renderer/store/task';
import styles from './StatusItems.module.css';

export function TokenDisplay(): ReactElement | null {
  const { t } = useTranslation();
  const task = useTask((s) => s.current);
  const sending = useTask((s) => s.sending);
  const estTokens = useTask((s) => s.running.estTokens);
  if (!task) return null;
  const total = (task.totalTokens?.input ?? 0) + (task.totalTokens?.output ?? 0);
  return (
    <span className={styles.item} title={t('statusBar.tokens.title', 'Token usage this task')}>
      {sending && <span className={styles.dot} aria-label="running" />}
      {total.toLocaleString()} {t('statusBar.tokens.unit', 'tok')}
      {sending && estTokens > 0 && ` +${estTokens.toLocaleString()}`}
    </span>
  );
}
