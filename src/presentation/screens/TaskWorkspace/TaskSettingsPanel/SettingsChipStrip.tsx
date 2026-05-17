// src/presentation/screens/TaskWorkspace/TaskSettingsPanel/SettingsChipStrip.tsx
// Plan 8b Task 7 — compact summary chip strip rendered when
// `task.settings_locked === true` AND the user has not toggled expand.
// Clicking the Edit button re-expands the full TaskSettingsPanel.

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { detectPreset } from '../../../../core/domain/involvement';
import type { LocalTaskSettings } from './TaskSettingsPanel';
import styles from './TaskSettingsPanel.module.css';

interface Props {
  readonly settings: LocalTaskSettings;
  readonly onExpand: () => void;
}

export function SettingsChipStrip({ settings, onExpand }: Props): ReactElement {
  const { t } = useTranslation();
  const preset = detectPreset({
    strictness_mode: settings.strictness_mode,
    response_mode: settings.response_mode,
    ask_before_edit: settings.ask_before_edit,
  });
  const presetLabel = preset
    ? t(`taskSettings.involvementPreset.${preset}`, preset)
    : t('taskSettings.involvementPreset.custom', 'Custom');
  return (
    <div className={styles.chipStrip} data-testid="settings-chip-strip">
      <span className={styles.chip} data-testid="chip-involvement">
        {presetLabel}
      </span>
      <span className={styles.chip} data-testid="chip-methodology-mode">
        {t(`taskSettings.methodologyMode.${settings.methodology_selection_mode}`)}
      </span>
      <span className={styles.chip} data-testid="chip-effort">
        {t(`taskSettings.effortLevel.${settings.effort}`)}
      </span>
      <span className={styles.chip} data-testid="chip-strictness">{settings.strictness_mode}</span>
      {settings.compliance_review_enabled && (
        <span className={styles.chip} data-testid="chip-compliance">
          {t('taskSettings.complianceChip')}
        </span>
      )}
      <button
        type="button"
        className={styles.editBtn}
        onClick={onExpand}
        data-testid="settings-expand-btn"
      >
        {t('taskSettings.edit')}
      </button>
    </div>
  );
}
