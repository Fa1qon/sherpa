// Prompt tab — system_prompt_template, user_view_template, role_split.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoleSplit, Stage } from '../../../../../core/domain/methodology';
import styles from '../StageForm.module.css';

export interface PromptProps {
  readonly stage: Stage;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

export function Prompt({ stage, onUpdate }: PromptProps): ReactElement {
  const { t } = useTranslation();

  function patchRoleSplit(next: Partial<RoleSplit>): Partial<Stage> {
    const merged = {
      ai_does:
        next.ai_does !== undefined ? next.ai_does : (stage.role_split?.ai_does ?? ''),
      human_does:
        next.human_does !== undefined
          ? next.human_does
          : (stage.role_split?.human_does ?? ''),
    };
    if (merged.ai_does === '' && merged.human_does === '') {
      return { role_split: undefined };
    }
    return { role_split: merged };
  }

  return (
    <div className={styles.tabBody}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.prompt.system', 'System prompt template (for AI)')}
        </span>
        <textarea
          value={stage.system_prompt_template ?? ''}
          onChange={(e) =>
            onUpdate({ system_prompt_template: e.target.value || undefined })
          }
          rows={10}
          className={styles.codeArea}
          placeholder="You are a {role}. The task is..."
        />
        <small className={styles.help}>
          {t(
            'library.edit.prompt.systemHelp',
            'Placeholders: {project.name}, {meta.complexity}, {stage.name}',
          )}
        </small>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.prompt.userView', 'User-view template (for translation chat)')}
        </span>
        <textarea
          value={stage.user_view_template ?? ''}
          onChange={(e) =>
            onUpdate({ user_view_template: e.target.value || undefined })
          }
          rows={6}
          placeholder="Сейчас мы собираем требования к задаче..."
        />
        <small className={styles.help}>
          {t(
            'library.edit.prompt.userViewHelp',
            'How the master chat presents this stage to the user — non-technical, in the project language.',
          )}
        </small>
      </label>

      <fieldset className={styles.fieldset}>
        <legend>{t('library.edit.prompt.roleSplit', 'Role split')}</legend>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            {t('library.edit.prompt.aiDoes', 'AI does')}
          </span>
          <input
            value={stage.role_split?.ai_does ?? ''}
            onChange={(e) => onUpdate(patchRoleSplit({ ai_does: e.target.value }))}
            placeholder="asks clarifying questions"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            {t('library.edit.prompt.humanDoes', 'Human does')}
          </span>
          <input
            value={stage.role_split?.human_does ?? ''}
            onChange={(e) => onUpdate(patchRoleSplit({ human_does: e.target.value }))}
            placeholder="answers, confirms scope"
          />
        </label>
      </fieldset>
    </div>
  );
}
