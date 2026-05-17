import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './TaskWorkspace.module.css';

export interface StageTransition {
  readonly stageId: string;
  readonly nextStageId: string;
  readonly ts: string;
}

interface Props {
  readonly transition: StageTransition;
}

export function StageBanner({ transition }: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <div className={styles.stageDivider} role="separator">
      <span className={styles.stageDividerText}>
        {t('task.stageComplete', 'Stage complete')}: {transition.stageId} → {transition.nextStageId}
      </span>
    </div>
  );
}
