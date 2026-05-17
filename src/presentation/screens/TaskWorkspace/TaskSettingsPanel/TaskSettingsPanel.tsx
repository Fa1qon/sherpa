import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  EffortLevel,
  ResponseMode,
  EconomyMode,
  MethodologySelectionMode,
  StrictnessMode,
} from '../../../../core/domain/task';
import { type InvolvementPreset, INVOLVEMENT_PRESETS, detectPreset } from '../../../../core/domain/involvement';
import styles from './TaskSettingsPanel.module.css';

export interface LocalTaskSettings {
  readonly methodology_selection_mode: MethodologySelectionMode;
  readonly methodology_id?: string;
  readonly strictness_mode: StrictnessMode;
  readonly effort: EffortLevel;
  readonly response_mode: ResponseMode;
  readonly economy_mode: EconomyMode;
  readonly compliance_review_enabled: boolean;
  readonly ask_before_edit: boolean;
}

export function defaultLocalSettings(): LocalTaskSettings {
  return {
    methodology_selection_mode: 'none',
    strictness_mode: 'standard',
    effort: 'normal',
    response_mode: 'detailed',
    economy_mode: 'unlimited',
    compliance_review_enabled: false,
    ask_before_edit: false,
  };
}

export interface MethodologyOption {
  readonly id: string;
  readonly name: string;
}

interface Props {
  readonly task: { settings_locked?: boolean };
  readonly settings: LocalTaskSettings;
  readonly onChange: (s: Partial<LocalTaskSettings>) => void;
  readonly expanded: boolean;
  readonly onToggleExpand: () => void;
  readonly methodologies: readonly MethodologyOption[];
  readonly localTitle: string;
  readonly onTitleChange?: (title: string) => void;
  /** Called when user clicks "Apply" on a locked (already-started) task. */
  readonly onApply?: () => void;
}

export function TaskSettingsPanel({
  task,
  settings,
  onChange,
  expanded,
  onToggleExpand,
  methodologies,
  localTitle,
  onTitleChange,
  onApply,
}: Props): ReactElement | null {
  const { t } = useTranslation();

  if (!expanded) return null;

  const activePreset = detectPreset({
    strictness_mode: settings.strictness_mode,
    response_mode: settings.response_mode,
    ask_before_edit: settings.ask_before_edit,
  });
  const presets: readonly InvolvementPreset[] = ['autopilot', 'standard', 'control', 'manual'];
  const modes: readonly MethodologySelectionMode[] = ['none', 'router', 'manual'];
  const efforts: readonly EffortLevel[] = ['fast', 'normal', 'thorough'];
  const responseModes: readonly ResponseMode[] = ['concise', 'detailed'];
  const economyModes: readonly EconomyMode[] = ['unlimited', 'budget'];
  const locked = task.settings_locked ?? false;

  return (
    <div className={styles.popup} data-testid="task-settings-panel">
      <div className={styles.popupHeader}>
        <span className={styles.popupTitle}>{t('taskSettings.title')}</span>
        <button
          type="button"
          className={styles.popupClose}
          onClick={onToggleExpand}
          data-testid="settings-collapse-btn"
          aria-label={t('taskSettings.collapse')}
        >
          ×
        </button>
      </div>

      <div className={styles.popupRow}>
        <span className={styles.popupLabel}>
          {t('task.settings.title_label', 'Название')}
        </span>
        <input
          className={styles.titleInput}
          placeholder={t('task.settings.title_placeholder', 'Что делаем?')}
          value={localTitle}
          onChange={(e) => onTitleChange?.(e.target.value)}
          autoFocus
          data-testid="task-title-input"
        />
      </div>

      <div className={styles.popupRow}>
        <span className={styles.popupLabel}>
          {t('taskSettings.involvement', 'Вовлечённость')}
        </span>
        <div className={styles.pillRow}>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`${styles.pill}${activePreset === preset ? ` ${styles.pillActive}` : ''}`}
              title={t(`taskSettings.involvementDesc.${preset}`, '')}
              onClick={() => {
                const s = INVOLVEMENT_PRESETS[preset];
                onChange({
                  strictness_mode: s.strictness_mode,
                  response_mode: s.response_mode,
                  ask_before_edit: s.ask_before_edit,
                });
              }}
              data-testid={`preset-${preset}`}
            >
              {t(`taskSettings.involvementPreset.${preset}`, preset)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.popupRow}>
        <span className={styles.popupLabel}>
          {t('taskSettings.methodology', 'Методология')}
          {locked && (
            <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.5 }}>
              {t('taskSettings.methodologyLocked', '(зафиксировано)')}
            </span>
          )}
        </span>
        <div className={styles.pillRow}>
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={locked}
              className={`${styles.pill}${settings.methodology_selection_mode === mode ? ` ${styles.pillActive}` : ''}`}
              onClick={() => onChange({ methodology_selection_mode: mode })}
              data-testid={`methodology-mode-${mode}`}
            >
              {t(`taskSettings.methodologyMode.${mode}`, mode)}
            </button>
          ))}
        </div>
        {settings.methodology_selection_mode === 'manual' && (
          <select
            className={styles.popupSelect}
            value={settings.methodology_id ?? ''}
            onChange={(e) => onChange({ methodology_id: e.target.value })}
            data-testid="methodology-id-select"
          >
            <option value="">{t('taskSettings.selectMethodology')}</option>
            {methodologies.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        {settings.methodology_selection_mode === 'router' && (
          <p
            className={styles.popupLabel}
            style={{ fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}
          >
            {t('taskSettings.routerPlaceholder')}
          </p>
        )}
      </div>

      <div className={styles.popupRow}>
        <span className={styles.popupLabel}>
          {t('taskSettings.effort', 'Усилие')}
        </span>
        <div className={styles.pillRow}>
          {efforts.map((level) => (
            <button
              key={level}
              type="button"
              className={`${styles.pill}${settings.effort === level ? ` ${styles.pillActive}` : ''}`}
              onClick={() => onChange({ effort: level })}
              data-testid={`effort-${level}`}
            >
              {t(`taskSettings.effortLevel.${level}`, level)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.popupRow}>
        <span className={styles.popupLabel}>
          {t('taskSettings.responseMode', 'Ответ')}
        </span>
        <div className={styles.pillRow}>
          {responseModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${styles.pill}${settings.response_mode === mode ? ` ${styles.pillActive}` : ''}`}
              onClick={() => onChange({ response_mode: mode })}
              data-testid={`response-mode-${mode}`}
            >
              {t(`taskSettings.responseModeOption.${mode}`, mode)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.popupRow}>
        <span className={styles.popupLabel}>
          {t('taskSettings.economyMode', 'Токены')}
        </span>
        <div className={styles.pillRow}>
          {economyModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${styles.pill}${settings.economy_mode === mode ? ` ${styles.pillActive}` : ''}`}
              onClick={() => onChange({ economy_mode: mode })}
              data-testid={`economy-mode-${mode}`}
            >
              {t(`taskSettings.economyModeOption.${mode}`, mode)}
            </button>
          ))}
        </div>
      </div>

      <hr className={styles.divider} />

      <label className={styles.popupCheck}>
        <input
          type="checkbox"
          checked={settings.ask_before_edit}
          onChange={(e) => onChange({ ask_before_edit: e.target.checked })}
          data-testid="ask-before-edit-toggle"
        />
        {t('taskSettings.askBeforeEdit', 'Запрашивать перед правкой файлов')}
      </label>

      {locked && onApply && (
        <button
          type="button"
          className={styles.applyBtn}
          onClick={onApply}
          data-testid="settings-apply-btn"
        >
          {t('taskSettings.apply', 'Применить')}
        </button>
      )}
    </div>
  );
}
