// Stuck tab — stuck policy (max_attempts, escalation_steps, error_compaction)
// + per-stage tracker comment template. Tracker template lives here because
// it describes how the stage reports completion — closely related to
// stuck-vs-success behaviour. Plan 6 Task 13.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Stage,
  StuckEscalationStep,
  StuckPolicy,
} from '../../../../../core/domain/methodology';
import styles from '../StageForm.module.css';

const STEP_OPTIONS: readonly StuckEscalationStep[] = [
  'change_tactics',
  'request_logging',
  'additional_research',
  'debugging_playbook',
  'user_override',
];

const STEP_LABEL_KEYS: Record<StuckEscalationStep, { readonly key: string; readonly fallback: string }> = {
  change_tactics: { key: 'library.edit.stuck.steps.changeTactics', fallback: 'Change tactics' },
  request_logging: { key: 'library.edit.stuck.steps.requestLogging', fallback: 'Request logging' },
  additional_research: { key: 'library.edit.stuck.steps.additionalResearch', fallback: 'Additional research' },
  debugging_playbook: { key: 'library.edit.stuck.steps.debuggingPlaybook', fallback: 'Debugging playbook' },
  user_override: { key: 'library.edit.stuck.steps.userOverride', fallback: 'User override' },
};

const STEP_DESC_KEYS: Record<StuckEscalationStep, { readonly key: string; readonly fallback: string }> = {
  change_tactics: {
    key: 'library.edit.stuck.steps.changeTacticsDesc',
    fallback: 'Switch to a different approach — alternate algorithm, tool, or structure of the solution.',
  },
  request_logging: {
    key: 'library.edit.stuck.steps.requestLoggingDesc',
    fallback: 'Request logs or traces to diagnose the failure.',
  },
  additional_research: {
    key: 'library.edit.stuck.steps.additionalResearchDesc',
    fallback: 'Look up additional documentation, search, or known cases.',
  },
  debugging_playbook: {
    key: 'library.edit.stuck.steps.debuggingPlaybookDesc',
    fallback: 'Run a debugging checklist (compile → test → assertions → DI).',
  },
  user_override: {
    key: 'library.edit.stuck.steps.userOverrideDesc',
    fallback: 'Ask the user which direction to take next.',
  },
};

interface Props {
  readonly stage: Stage;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

export function Stuck({ stage, onUpdate }: Props): ReactElement {
  const { t } = useTranslation();
  const pol: StuckPolicy = stage.stuck_policy ?? {
    max_attempts: 3,
    escalation_steps: [],
  };

  function toggleStep(opt: StuckEscalationStep, checked: boolean): void {
    // Re-derive from STEP_OPTIONS so the resulting list is in canonical
    // (declared) order, regardless of toggle sequence.
    const next: readonly StuckEscalationStep[] = checked
      ? STEP_OPTIONS.filter((s) => pol.escalation_steps.includes(s) || s === opt)
      : pol.escalation_steps.filter((s) => s !== opt);
    onUpdate({ stuck_policy: { ...pol, escalation_steps: next } });
  }

  return (
    <div className={styles.stuckTab}>
      <fieldset>
        <legend>{t('library.edit.stuck.policyLegend', 'Stuck policy')}</legend>
        <label>
          {t('library.edit.stuck.maxAttempts', 'Max attempts')}
          <input
            type="number"
            min={1}
            value={pol.max_attempts}
            onChange={(e) =>
              onUpdate({
                stuck_policy: {
                  ...pol,
                  max_attempts: Number.parseInt(e.target.value, 10) || 1,
                },
              })
            }
          />
        </label>
        <fieldset>
          <legend>
            {t(
              'library.edit.stuck.escalationStepsLegend',
              'Escalation steps (in order)',
            )}
          </legend>
          {STEP_OPTIONS.map((opt) => (
            <div key={opt} className={styles.stepRow}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={pol.escalation_steps.includes(opt)}
                  onChange={(e) => toggleStep(opt, e.target.checked)}
                />
                <strong>{t(STEP_LABEL_KEYS[opt].key, STEP_LABEL_KEYS[opt].fallback)}</strong>
              </label>
              <small className={styles.stepDesc}>
                {t(STEP_DESC_KEYS[opt].key, STEP_DESC_KEYS[opt].fallback)}
              </small>
            </div>
          ))}
        </fieldset>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={pol.error_compaction === true}
            onChange={(e) =>
              onUpdate({
                stuck_policy: {
                  ...pol,
                  error_compaction: e.target.checked || undefined,
                },
              })
            }
          />
          {t(
            'library.edit.stuck.errorCompaction',
            'Compact error to 1-2 sentences between cycles',
          )}
        </label>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.stuck.trackerTemplate', 'Tracker comment template')}
        </span>
        <textarea
          value={stage.tracker_template ?? ''}
          onChange={(e) =>
            onUpdate({ tracker_template: e.target.value || undefined })
          }
          rows={3}
          placeholder="Stage W2 complete: {summary}"
        />
        <small className={styles.help}>
          {t(
            'library.edit.stuck.trackerHelp',
            'Used by the tracker plugin (Plan 9) to write a comment on the task when this stage completes.',
          )}
        </small>
      </label>

      <p className={styles.engineNote}>
        <em>
          {t(
            'library.edit.stuck.engineNote',
            'The actual behaviour of each step is executed by the task engine.',
          )}
        </em>
      </p>
    </div>
  );
}
