// Phases tab — inline phases list editor + phases_source switcher +
// from_artifact picker. PhaseEdges as a linear list deferred to Plan 8
// (canvas-in-canvas). Per-phase row exposes id + name + mode + a
// collapsible prompt textarea (Plan 7 Task 6). Per-phase gate/questions
// editing still deferred.
// Plan 6 Task 12 + Plan 7 Task 6.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Gate,
  GateItem,
  GateItemKind,
  Methodology,
  Phase,
  PhasesFromArtifact,
  Stage,
  StageMode,
} from '../../../../../core/domain/methodology';
import styles from '../StageForm.module.css';

export interface PhasesProps {
  readonly stage: Stage;
  readonly draft: Methodology;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

interface SubProps {
  readonly stage: Stage;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

interface FromArtifactProps extends SubProps {
  readonly draft: Methodology;
}

export function Phases({ stage, draft, onUpdate }: PhasesProps): ReactElement {
  const { t } = useTranslation();
  const source = stage.phases_source ?? 'inline';

  function setSource(next: 'inline' | 'from_artifact'): void {
    if (next === 'inline') {
      // Keep YAML clean — emit phases_source: undefined when default.
      // Clear phases_from_artifact when switching away from from_artifact.
      onUpdate({ phases_source: undefined, phases_from_artifact: undefined });
    } else {
      // Switching to from_artifact: clear inline phases (so the user
      // gets a validator-clean from_artifact stage) and seed config.
      onUpdate({
        phases_source: 'from_artifact',
        phases: undefined,
        phases_from_artifact: stage.phases_from_artifact ?? {
          stage_id: '',
          artifact: '',
          section: '## Phases',
        },
      });
    }
  }

  return (
    <div className={styles.phasesTab}>
      <fieldset>
        <legend>{t('library.edit.phases.sourceLegend', 'Phase source')}</legend>
        <label>
          <input
            type="radio"
            name="phases-source"
            checked={source === 'inline'}
            onChange={() => setSource('inline')}
          />{' '}
          {t(
            'library.edit.phases.sourceInline',
            'Inline (methodology defines phases)',
          )}
        </label>
        <label>
          <input
            type="radio"
            name="phases-source"
            checked={source === 'from_artifact'}
            onChange={() => setSource('from_artifact')}
          />{' '}
          {t(
            'library.edit.phases.sourceFromArtifact',
            "From artifact (generated at runtime from a prior stage's output)",
          )}
        </label>
      </fieldset>

      {source === 'from_artifact' ? (
        <FromArtifactPicker stage={stage} draft={draft} onUpdate={onUpdate} />
      ) : (
        <InlinePhasesEditor stage={stage} onUpdate={onUpdate} />
      )}
    </div>
  );
}

function FromArtifactPicker({
  stage,
  draft,
  onUpdate,
}: FromArtifactProps): ReactElement {
  const { t } = useTranslation();
  const upstream = draft.stages.filter((s) => s.id !== stage.id);
  const cfg: PhasesFromArtifact = stage.phases_from_artifact ?? {
    stage_id: '',
    artifact: '',
    section: '## Phases',
  };

  function patch(next: PhasesFromArtifact): void {
    onUpdate({ phases_from_artifact: next });
  }

  return (
    <div className={styles.tabBody}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.phases.sourceStage', 'Source stage')}
        </span>
        <select
          value={cfg.stage_id}
          onChange={(e) => patch({ ...cfg, stage_id: e.target.value })}
        >
          <option value="">
            {t('library.edit.phases.selectStage', '(select)')}
          </option>
          {upstream.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.phases.artifact', 'Artifact')}
        </span>
        <input
          value={cfg.artifact}
          onChange={(e) => patch({ ...cfg, artifact: e.target.value })}
          placeholder="plan.md"
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          {t('library.edit.phases.section', 'Section')}
        </span>
        <input
          value={cfg.section}
          onChange={(e) => patch({ ...cfg, section: e.target.value })}
          placeholder="## Phases"
        />
      </label>
    </div>
  );
}

function InlinePhasesEditor({ stage, onUpdate }: SubProps): ReactElement {
  const { t } = useTranslation();
  const phases: readonly Phase[] = stage.phases ?? [];

  function updatePhase(i: number, p: Partial<Phase>): void {
    const next = phases.slice();
    const cur = next[i];
    if (!cur) return;
    next[i] = { ...cur, ...p };
    onUpdate({ phases: next });
  }

  function removePhase(i: number): void {
    const next = phases.filter((_, idx) => idx !== i);
    onUpdate({ phases: next.length > 0 ? next : undefined });
  }

  function addPhase(): void {
    let n = phases.length + 1;
    let id = `phase_${n}`;
    while (phases.some((p) => p.id === id)) {
      n += 1;
      id = `phase_${n}`;
    }
    onUpdate({ phases: [...phases, { id, name: id }] });
  }

  return (
    <div>
      <ol className={styles.phaseList}>
        {phases.map((ph, i) => (
          <li key={i} className={styles.phaseRow}>
            <div className={styles.phaseHeader}>
              <input
                value={ph.id}
                onChange={(e) => updatePhase(i, { id: e.target.value })}
                placeholder="id"
              />
              <input
                value={ph.name}
                onChange={(e) => updatePhase(i, { name: e.target.value })}
                placeholder="name"
              />
              <select
                value={ph.mode ?? ''}
                onChange={(e) =>
                  updatePhase(i, {
                    mode: (e.target.value || undefined) as
                      | StageMode
                      | undefined,
                  })
                }
              >
                <option value="">
                  {t('library.edit.phases.inheritMode', '(inherit)')}
                </option>
                <option value="auto">auto</option>
                <option value="interactive">interactive</option>
                <option value="gate">gate</option>
              </select>
              <button
                type="button"
                onClick={() => removePhase(i)}
                aria-label={t('library.edit.phases.removePhase', 'Remove')}
              >
                ×
              </button>
            </div>
            <details className={styles.phaseDetail}>
              <summary>{t('library.edit.phases.prompt', 'Prompt')}</summary>
              <textarea
                value={ph.prompt ?? ''}
                onChange={(e) =>
                  updatePhase(i, { prompt: e.target.value || undefined })
                }
                rows={4}
                placeholder={t(
                  'library.edit.phases.promptPlaceholder',
                  'What the AI does in this phase (overrides stage prompt if set).',
                )}
              />
            </details>
            <details className={styles.phaseDetail}>
              <summary>{t('phase.gateItems', 'Gate items')}</summary>
              <PhaseGateEditor phase={ph} onUpdatePhase={(patch) => updatePhase(i, patch)} />
            </details>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={addPhase}
        className={styles.addButton}
      >
        {t('library.edit.phases.addPhase', '+ Add phase')}
      </button>
    </div>
  );
}

interface PhaseGateEditorProps {
  readonly phase: Phase;
  readonly onUpdatePhase: (patch: Partial<Phase>) => void;
}

const GATE_ITEM_KINDS: readonly GateItemKind[] = ['artifact_written', 'user_confirmed', 'reviewer_pass'];

function PhaseGateEditor({ phase, onUpdatePhase }: PhaseGateEditorProps): ReactElement {
  const { t } = useTranslation();
  const items: readonly GateItem[] = phase.gate?.items ?? [];

  function patchGate(nextItems: readonly GateItem[]): void {
    const gate: Gate = { kind: phase.gate?.kind ?? 'standard', items: nextItems };
    onUpdatePhase({ gate: nextItems.length > 0 ? gate : undefined });
  }

  function updateItem(idx: number, patch: Partial<GateItem>): void {
    const next = items.slice();
    const cur = next[idx];
    if (!cur) return;
    next[idx] = { ...cur, ...patch };
    patchGate(next);
  }

  function removeItem(idx: number): void {
    patchGate(items.filter((_, i) => i !== idx));
  }

  function addItem(): void {
    const newItem: GateItem = { id: `g-${Date.now()}`, label: 'New item', kind: 'artifact_written' };
    patchGate([...items, newItem]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {items.map((item, idx) => (
        <div key={item.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            value={item.label}
            onChange={(e) => updateItem(idx, { label: e.target.value })}
            placeholder="label"
            style={{ flex: 2, fontSize: 12 }}
          />
          <select
            value={item.kind}
            onChange={(e) => updateItem(idx, { kind: e.target.value as GateItemKind })}
            style={{ flex: 1, fontSize: 12 }}
          >
            {GATE_ITEM_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button type="button" onClick={() => removeItem(idx)} style={{ fontSize: 12 }}>×</button>
        </div>
      ))}
      <button type="button" onClick={addItem} style={{ fontSize: 12, alignSelf: 'flex-start' }}>
        {t('phase.addGateItem', '+ Gate item')}
      </button>
    </div>
  );
}
