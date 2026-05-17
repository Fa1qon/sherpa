// General tab — id (readonly), name, mode, execution_isolation, confidence_threshold.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ExecutionIsolation,
  RoleSplit,
  Stage,
  StageMode,
} from '../../../../../core/domain/methodology';
import styles from '../StageForm.module.css';

const MODES: readonly StageMode[] = ['auto', 'interactive', 'gate'];
const ISOLATIONS: readonly ExecutionIsolation[] = [
  'inline',
  'subagent',
  'parallel_subagents',
];

export interface GeneralProps {
  readonly stage: Stage;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

export function General({ stage, onUpdate }: GeneralProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className={styles.tabBody}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('library.edit.field.id', 'id')}</span>
        <input
          value={stage.id}
          readOnly
          aria-readonly="true"
          tabIndex={-1}
          className={styles.idReadonly}
        />
        <small className={styles.help}>
          {t('library.edit.idImmutable', 'id is immutable after creation')}
        </small>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('library.edit.field.name', 'name')}</span>
        <input
          value={stage.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('library.edit.field.mode', 'mode')}</span>
        <select
          value={stage.mode}
          onChange={(e) => onUpdate({ mode: e.target.value as StageMode })}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.field.executionIsolation', 'execution_isolation')}
        </span>
        <select
          value={stage.execution_isolation ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onUpdate({
              execution_isolation: v === '' ? undefined : (v as ExecutionIsolation),
            });
          }}
        >
          <option value="">
            {t('library.edit.field.inherit', 'Inherit')}
          </option>
          {ISOLATIONS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.field.confidenceThreshold', 'confidence_threshold')}
        </span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={stage.confidence_threshold ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onUpdate({ confidence_threshold: undefined });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) onUpdate({ confidence_threshold: n });
          }}
        />
        <small className={styles.help}>
          {t(
            'library.edit.field.confidenceThresholdHelp',
            'Engine blocks gate when measured confidence falls below this',
          )}
        </small>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('stage.roleSplit.ai', 'AI does')}</span>
        <textarea
          rows={2}
          value={stage.role_split?.ai_does ?? ''}
          onChange={(e) => {
            const next: RoleSplit = { ai_does: e.target.value, human_does: stage.role_split?.human_does ?? '' };
            onUpdate({ role_split: next });
          }}
          placeholder={t('stage.roleSplit.aiPlaceholder', 'What the agent handles autonomously')}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('stage.roleSplit.human', 'Human does')}</span>
        <textarea
          rows={2}
          value={stage.role_split?.human_does ?? ''}
          onChange={(e) => {
            const next: RoleSplit = { ai_does: stage.role_split?.ai_does ?? '', human_does: e.target.value };
            onUpdate({ role_split: next });
          }}
          placeholder={t('stage.roleSplit.humanPlaceholder', 'What the human must do or review')}
        />
      </label>
    </div>
  );
}
