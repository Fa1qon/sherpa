// src/presentation/screens/TaskWorkspace/TaskWorkspace.tsx
// Minimal chat workspace for an active Task: header, thread, input.
// Plan 8 Task 17 — adds a Chat/Trace tab toggle. Trace tab mounts TracePanel.
// Plan 8b Task 4 — renames trace→journal; hides journal tab behind Settings.showEventLog.
// Plan 8 Task 18 — adds a Compliance tab.
// Plan 8 Task 19 — right sidebar panels moved to RightSidebar via panel registry (Plan B).
// Plan B Task 10 — remove embedded aside; use useTaskSync hook for store-level meta/methodology.
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useTask } from '../../../renderer/store/task';
import { useSettings } from '../../../renderer/store/settings';
import { useProject } from '../../../renderer/store/project';
import { useNavigation } from '../../../renderer/store/navigation';
import { useTaskSync } from '../../../renderer/hooks/useTaskSync';
import { ChatThread } from './ChatThread';
import { type StageTransition } from './StageBanner';
import { ChatInput } from './ChatInput';
import { WorkingIndicator } from './WorkingIndicator';
import { SessionDrawer } from './SessionDrawer';
import { TracePanel } from './TracePanel';
import {
  TaskSettingsPanel,
  defaultLocalSettings,
  type LocalTaskSettings,
  type MethodologyOption,
} from './TaskSettingsPanel';
import { detectPreset } from '../../../core/domain/involvement';
import { StageProgressBar } from './StageProgressBar';
import { AskUserQuestionPopup } from './AskUserQuestionPopup';
import styles from './TaskWorkspace.module.css';

type WorkspaceTab = 'chat' | 'journal';

export function TaskWorkspace(): ReactElement {
  const { t } = useTranslation();
  const task = useTask((s) => s.current);
  const error = useTask((s) => s.error);
  const sending = useTask((s) => s.sending);
  const running = useTask((s) => s.running);
  const runtimeStatus = useTask((s) => s.runtime.status);
  const meta = useTask((s) => s.meta);
  const methodology = useTask((s) => s.methodology);
  const costTracking = useSettings((s) => s.user.costTracking);
  const showEventLog = useSettings((s) => s.user.showEventLog);
  const project = useProject((s) => s.current);
  const activeTabId = useNavigation((s) => s.activeTabId);
  const activeTabParams = useNavigation((s) =>
    s.tabs.find((t) => t.id === s.activeTabId)?.params,
  );
  const isNewTab = activeTabParams?.taskId?.startsWith('new-') ?? false;
  const [tab, setTab] = useState<WorkspaceTab>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stageTransitions, setStageTransitions] = useState<StageTransition[]>([]);

  // Plan B Task 10 — useTaskSync polls meta + loads methodology into store.
  useTaskSync();

  // Plan 8b Task 7 — TaskSettingsPanel state.
  const [localSettings, setLocalSettings] = useState<LocalTaskSettings>(() => defaultLocalSettings());
  const [titleDraft, setTitleDraft] = useState<string>('');
  const [settingsPanelExpanded, setSettingsPanelExpanded] = useState(true);
  const [methodologyOptions, setMethodologyOptions] = useState<readonly MethodologyOption[]>([]);

  const projectPath = project?.path ?? '';
  const taskId = task?.id ?? '';

  const activePreset = detectPreset({
    strictness_mode: localSettings.strictness_mode,
    response_mode: localSettings.response_mode,
    ask_before_edit: localSettings.ask_before_edit,
  });
  const presetChip: Record<string, string> = {
    autopilot: t('taskSettings.involvementPreset.autopilot', 'Авто'),
    standard: t('taskSettings.involvementPreset.standard', 'Стандарт'),
    control: t('taskSettings.involvementPreset.control', 'Контроль'),
    manual: t('taskSettings.involvementPreset.manual', 'Ручной'),
  };
  const effortChip: Record<string, string> = {
    fast: t('taskSettings.effortLevel.fast', 'Быстро'),
    normal: t('taskSettings.effortLevel.normal', 'Норма'),
    thorough: t('taskSettings.effortLevel.thorough', 'Тщательно'),
  };
  const responseChip: Record<string, string> = {
    concise: t('taskSettings.responseModeOption.concise', 'Кратко'),
    detailed: t('taskSettings.responseModeOption.detailed', 'Подробно'),
  };
  const settingsChipLabel = [
    activePreset ? (presetChip[activePreset] ?? activePreset) : t('taskSettings.involvementPreset.custom', 'Настройки'),
    effortChip[localSettings.effort] ?? localSettings.effort,
    responseChip[localSettings.response_mode] ?? localSettings.response_mode,
  ].join(' · ');

  // Seed localSettings from the task when the active task changes.
  useEffect(() => {
    if (!task) return;
    setStageTransitions([]);
    setLocalSettings({
      methodology_selection_mode: task.methodology_selection_mode ?? 'none',
      methodology_id: task.methodologyId,
      strictness_mode: task.strictness_mode ?? 'standard',
      effort: task.effort ?? 'normal',
      response_mode: task.response_mode ?? 'detailed',
      economy_mode: task.economy_mode ?? 'unlimited',
      compliance_review_enabled: task.compliance_review_enabled ?? false,
      ask_before_edit: task.ask_before_edit ?? false,
    });
    setTitleDraft(task.title ?? '');
    setSettingsPanelExpanded(!task.settings_locked);
  }, [task]);

  // Reflect the title draft immediately in the tab label for new-task tabs.
  useEffect(() => {
    if (!isNewTab || !activeTabId) return;
    const label = titleDraft.trim();
    useNavigation.getState().updateTabTitle(activeTabId, label || t('task.new', 'Новая задача'));
  }, [titleDraft, isNewTab, activeTabId, t]);

  // Plan 8b Task 7 — fetch methodology summaries for the manual-mode dropdown.
  useEffect(() => {
    if (!projectPath) {
      setMethodologyOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await window.sherpa.methodology.list(projectPath);
        if (cancelled) return;
        setMethodologyOptions(list.map((m) => ({ id: m.id, name: m.name })));
      } catch {
        if (!cancelled) setMethodologyOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  // Plan 8-fix Task 3 — subscribe to engine events for the active task.
  useEffect(() => {
    if (!taskId) return;
    const unsubscribe = window.sherpa.task.onEvent((ev) => {
      if (ev.taskId !== taskId) return;
      if (ev.kind === 'engine_event') {
        useTask.getState().applyEngineEvent(ev.event);
        const event = ev.event as { kind: string; stageId?: string; nextStageId?: string; ts?: string };
        if (event.kind === 'stage_completed' && event.stageId && event.nextStageId) {
          setStageTransitions((prev) => [
            ...prev,
            {
              stageId: event.stageId!,
              nextStageId: event.nextStageId!,
              ts: event.ts ?? new Date().toISOString(),
            },
          ]);
        }
      }
    });
    return unsubscribe;
  }, [taskId]);

  // Plan 8b Task 7 — apply pending TaskSettingsPanel selection before the
  // first user-message send. For new tabs (no task yet), creates the task lazily.
  const handleBeforeFirstSend = async (): Promise<void> => {
    if (!task) {
      // Lazy task creation on first send.
      if (!projectPath) return;
      try {
        const created = await window.sherpa.task.create({
          title: titleDraft || undefined,
          projectPath,
          methodology_selection_mode: localSettings.methodology_selection_mode,
          methodologyId:
            localSettings.methodology_selection_mode === 'manual'
              ? localSettings.methodology_id
              : undefined,
          effort: localSettings.effort,
          response_mode: localSettings.response_mode,
          economy_mode: localSettings.economy_mode,
          compliance_review_enabled: localSettings.compliance_review_enabled,
        });
        const applied = await window.sherpa.task.applySettings(created.id, {
          strictness_mode: localSettings.strictness_mode,
          ask_before_edit: localSettings.ask_before_edit,
        });
        const locked = await window.sherpa.task.lockSettings(created.id);
        const finalTask = locked ?? applied ?? created;
        useTask.getState().setCurrent(finalTask);
        if (activeTabId) {
          useNavigation.getState().updateTabParams(activeTabId, { taskId: finalTask.id });
          useNavigation.getState().updateTabTitle(activeTabId, finalTask.title ?? finalTask.id);
        }
      } catch {
        // Best-effort — do NOT block the send.
      }
      return;
    }
    if (task.settings_locked) return;
    try {
      const applied = await window.sherpa.task.applySettings(task.id, {
        title: titleDraft,
        methodology_selection_mode: localSettings.methodology_selection_mode,
        methodologyId:
          localSettings.methodology_selection_mode === 'manual'
            ? localSettings.methodology_id
            : undefined,
        effort: localSettings.effort,
        response_mode: localSettings.response_mode,
        economy_mode: localSettings.economy_mode,
        compliance_review_enabled: localSettings.compliance_review_enabled,
        strictness_mode: localSettings.strictness_mode,
        ask_before_edit: localSettings.ask_before_edit,
      });
      const locked = await window.sherpa.task.lockSettings(task.id);
      const next = locked ?? applied;
      if (next) {
        useTask.getState().setCurrent(next);
        setSettingsPanelExpanded(false);
      }
    } catch {
      // Best-effort — do NOT block the send.
    }
  };

  if (!task && !isNewTab) {
    return (
      <div className={styles.workspace} data-testid="task-workspace">
        <div className={styles.emptyHint}>{t('task.empty', 'No task selected.')}</div>
      </div>
    );
  }

  if (!task) {
    // New task tab — render settings inline (filling available space) above input.
    return (
      <div className={styles.workspace} data-testid="task-workspace">
        <div className={styles.body}>
          <div className={styles.main}>
            <TaskSettingsPanel
              inline
              task={{ settings_locked: false }}
              settings={localSettings}
              onChange={(patch) => setLocalSettings((prev) => ({ ...prev, ...patch }))}
              expanded={settingsPanelExpanded}
              onToggleExpand={() => setSettingsPanelExpanded((v) => !v)}
              methodologies={methodologyOptions}
              localTitle={titleDraft}
              onTitleChange={setTitleDraft}
            />
            <div className={styles.inputArea}>
              <ChatInput
                onBeforeSend={handleBeforeFirstSend}
                onSettingsToggle={() => setSettingsPanelExpanded((v) => !v)}
                settingsChip={settingsChipLabel}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Apply settings changes on an already-locked (running) task.
  const handleApplySettings = async (): Promise<void> => {
    if (!task) return;
    try {
      const updated = await window.sherpa.task.applySettings(task.id, {
        title: titleDraft || undefined,
        effort: localSettings.effort,
        response_mode: localSettings.response_mode,
        economy_mode: localSettings.economy_mode,
        strictness_mode: localSettings.strictness_mode,
        ask_before_edit: localSettings.ask_before_edit,
        compliance_review_enabled: localSettings.compliance_review_enabled,
      });
      if (updated) {
        useTask.getState().setCurrent(updated);
        setSettingsPanelExpanded(false);
      }
    } catch {
      // Best-effort.
    }
  };

  // Plan 8-fix Task 4 — Resume banner for cross-session paused tasks.
  const showResumeBanner = meta?.status === 'paused' && runtimeStatus === 'inactive';

  const handleBannerResume = async (): Promise<void> => {
    if (!projectPath || !taskId) return;
    try {
      await window.sherpa.task.resume({ projectPath, taskId });
      // useTaskSync will pick up the updated meta on next poll tick.
    } catch {
      // Errors surfaced via TaskControls error region on next attempt.
    }
  };

  return (
    <div className={styles.workspace} data-testid="task-workspace">
      <div className={styles.body}>
        <div className={styles.main}>
          {showResumeBanner && (() => {
            const stageId = meta?.current_stage ?? '';
            const STAGE_TOKEN = 'STAGE';
            const raw = t('taskWorkspace.resumeBanner.title', { stage: STAGE_TOKEN });
            const [before, after = ''] = raw.split(STAGE_TOKEN);
            return (
              <div
                className={styles.resumeBanner}
                role="status"
                data-testid="resume-banner"
              >
                <span
                  className={styles.resumeBannerText}
                  data-testid="resume-banner-text"
                >
                  {before}
                  <strong>{stageId}</strong>
                  {after}
                </span>
                <button
                  type="button"
                  className={styles.resumeBannerBtn}
                  onClick={() => void handleBannerResume()}
                  data-testid="resume-banner-button"
                >
                  {t('taskWorkspace.resumeBanner.resume', 'Resume')}
                </button>
              </div>
            );
          })()}
          <header className={styles.header}>
            <h2 className={styles.title}>
              {task.methodologyId && task.stageId
                ? t('task.header', { methodology: task.methodologyId, stage: task.stageId })
                : (task.title ?? t('task.empty', 'No task selected.'))}
            </h2>
            <span className={styles.status} data-status={task.status}>{task.status}</span>
            {showEventLog && (
            <div className={styles.tabSwitcher} role="tablist" aria-label="workspace tabs">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'chat'}
                data-active={tab === 'chat' ? 'true' : 'false'}
                className={styles.tabBtn}
                onClick={() => setTab('chat')}
              >
                {t('taskWorkspace.tab.chat', 'Chat')}
              </button>
              {showEventLog && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'journal'}
                  data-active={tab === 'journal' ? 'true' : 'false'}
                  className={styles.tabBtn}
                  onClick={() => setTab('journal')}
                >
                  {t('taskWorkspace.tab.journal', 'Event log')}
                </button>
              )}
            </div>
            )}
          </header>
          {task.methodologyId && <StageProgressBar task={task} methodology={methodology} />}
          {error && <div className={styles.error}>{error}</div>}
          {tab === 'chat' ? (
            <>
              <ChatThread messages={task.thread} stageTransitions={stageTransitions} />
              {(sending || runtimeStatus === 'running') && <WorkingIndicator counters={{ ...running, onOpenDrawer: () => setDrawerOpen(true) }} />}
              {!sending && task.totalTokens.input + task.totalTokens.output > 0 && (() => {
                const totalTokens = task.totalTokens;
                const showCost =
                  costTracking.showCost &&
                  (costTracking.pricePerMillionInputTokens > 0 || costTracking.pricePerMillionOutputTokens > 0);
                const computedCost =
                  (totalTokens.input * costTracking.pricePerMillionInputTokens +
                    totalTokens.output * costTracking.pricePerMillionOutputTokens) / 1_000_000;
                return (
                  <div className={styles.usageFooter}>
                    {t('chat.usedTokens', 'Used')}: {totalTokens.input} {t('chat.tokensIn', 'in')} / {totalTokens.output} {t('chat.tokensOut', 'out')}
                    {showCost && ` — $${computedCost.toFixed(4)}`}
                  </div>
                );
              })()}
              <AskUserQuestionPopup
                thread={task.thread}
                sending={sending}
                onAnswer={(text) => void useTask.getState().sendUserMessage(projectPath, text)}
              />
              <div className={styles.inputArea}>
                <TaskSettingsPanel
                  task={task}
                  settings={localSettings}
                  onChange={(patch) => setLocalSettings((prev) => ({ ...prev, ...patch }))}
                  expanded={settingsPanelExpanded}
                  onToggleExpand={() => setSettingsPanelExpanded((v) => !v)}
                  methodologies={methodologyOptions}
                  localTitle={titleDraft}
                  onTitleChange={setTitleDraft}
                  onApply={task.settings_locked ? () => void handleApplySettings() : undefined}
                />
                <ChatInput
                  onBeforeSend={task.settings_locked ? undefined : handleBeforeFirstSend}
                  onSettingsToggle={() => setSettingsPanelExpanded((v) => !v)}
                  settingsChip={settingsChipLabel}
                />
              </div>
            </>
          ) : null}
          {showEventLog && tab === 'journal' && (
            <TracePanel projectPath={projectPath} taskId={task.id} />
          )}
        </div>
      </div>
      {drawerOpen && (
        <SessionDrawer
          messages={task.thread}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
