import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Task } from '../../../core/domain/task';
import type { Methodology } from '../../../core/domain/methodology';
import styles from './StageProgressBar.module.css';

interface Props {
  task: Task;
  methodology: Methodology | null;
}

export function StageProgressBar({ task, methodology }: Props): ReactElement | null {
  const { t } = useTranslation();

  if (!task.methodologyId || !methodology || methodology.stages.length === 0) return null;

  const stages = methodology.stages;
  const isComplete = task.stageId === 'end';
  const currentIdx = isComplete
    ? stages.length
    : stages.findIndex((s) => s.id === task.stageId);
  const displayIdx = currentIdx < 0 ? 0 : currentIdx;
  const currentStage = stages[displayIdx];

  return (
    <div className={styles.bar}>
      <div className={styles.track}>
        {stages.map((s, i) => (
          <div
            key={s.id}
            className={styles.step}
            data-done={i < displayIdx ? 'true' : 'false'}
            data-active={i === displayIdx && !isComplete ? 'true' : 'false'}
          />
        ))}
      </div>
      <span className={styles.label}>
        {isComplete
          ? t('stageBar.done', 'Methodology complete')
          : currentStage
            ? t('stageBar.step', 'Stage {{n}}/{{total}}: {{name}}', {
                n: displayIdx + 1,
                total: stages.length,
                name: currentStage.name,
              })
            : t('stageBar.starting', 'Starting…')}
      </span>
    </div>
  );
}
