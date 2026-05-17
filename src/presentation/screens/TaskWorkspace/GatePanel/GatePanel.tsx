// src/presentation/screens/TaskWorkspace/GatePanel/GatePanel.tsx
// Plan 8 Task 19 — Right-sidebar gate panel.
// Plan 8-fix Task 3 — layered with live verdicts from
// useTask().runtime.gateVerdicts (keyed by stageId). When the engine has
// emitted a `gate_evaluated` for the current stage, those per-item
// verdicts win over the optional `verdicts` prop. Falls back to the prop
// (and ultimately 'ask') when no live signal is available.
//
// Renders Stage.gate.items for the current stage. Each item gets a
// verdict glyph derived from runtime → prop → 'ask'.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Methodology } from '../../../../core/domain/methodology';
import type { TaskMeta } from '../../../../core/domain/task_meta';
import { useTask } from '../../../../renderer/store/task';
import styles from './GatePanel.module.css';

export type GateVerdict = 'pass' | 'ask' | 'fail';

interface Props {
  readonly methodology: Methodology | null;
  readonly meta: TaskMeta | null;
  /**
   * Optional per-item verdicts keyed by `GateItem.id`. Used as a fallback
   * when the live engine runtime has no `gate_evaluated` yet for the
   * current stage. Missing entries default to 'ask' (still waiting).
   */
  readonly verdicts?: Readonly<Record<string, GateVerdict>>;
}

function glyphFor(v: GateVerdict): string {
  switch (v) {
    case 'pass':
      return '✓';
    case 'fail':
      return '✗';
    case 'ask':
    default:
      return '?';
  }
}

export function GatePanel({ methodology, meta, verdicts }: Props): ReactElement {
  const { t } = useTranslation();
  const runtime = useTask((s) => s.runtime);

  // Active stage: prefer live runtime cursor, fall back to meta.
  const activeStageId = runtime.currentStageId ?? meta?.current_stage ?? null;

  if (!methodology || !activeStageId) {
    return (
      <section className={styles.panel} data-testid="gate-panel">
        <header className={styles.header}>
          <h3 className={styles.title}>{t('gatePanel.title', 'Gate')}</h3>
        </header>
        <div className={styles.empty} data-testid="gate-no-stage">
          {t('gatePanel.noStage', 'No active stage.')}
        </div>
      </section>
    );
  }

  const stage = methodology.stages.find((s) => s.id === activeStageId);
  const gate = stage?.gate;

  // Live verdicts: derive per-item map from runtime.gateVerdicts[activeStageId]
  // when the engine has emitted a `gate_evaluated` event. Otherwise fall
  // back to the optional `verdicts` prop, then to default 'ask'.
  const liveEval = runtime.gateVerdicts[activeStageId];
  const liveItemVerdicts: Readonly<Record<string, GateVerdict>> | undefined =
    liveEval && liveEval.kind !== 'no_gate'
      ? Object.fromEntries(liveEval.items.map((it) => [it.id, it.verdict]))
      : undefined;

  return (
    <section className={styles.panel} data-testid="gate-panel">
      <header className={styles.header}>
        <h3 className={styles.title}>{t('gatePanel.title', 'Gate')}</h3>
      </header>
      {!gate || gate.items.length === 0 ? (
        <div className={styles.empty} data-testid="gate-empty">
          {t('gatePanel.empty', 'No gate for this stage.')}
        </div>
      ) : (
        <ul className={styles.list} role="list">
          {gate.items.map((item) => {
            const v: GateVerdict = liveItemVerdicts?.[item.id] ?? verdicts?.[item.id] ?? 'ask';
            const verdictLabel = t(`gatePanel.verdict.${v}`);
            return (
              <li
                key={item.id}
                className={styles.row}
                data-testid={`gate-item-${item.id}`}
                data-verdict={v}
              >
                <span
                  className={styles.glyph}
                  aria-label={verdictLabel}
                  data-testid={`gate-verdict-${item.id}`}
                >
                  {glyphFor(v)}
                </span>
                <span className={styles.label}>{item.label || item.id}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
