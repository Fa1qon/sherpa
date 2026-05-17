// I/O tab — Stage.contract.input, Stage.contract.output, Stage.context_essentials.
// Plan 6 Task 9.
//
// Upstream stages (v1 approximation): stages with an index < this stage's index
// in draft.stages. Plan 8 will refine via true reachability over edges.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ArtifactFormat,
  ArtifactRef,
  ArtifactSpec,
  Methodology,
  Stage,
} from '../../../../../core/domain/methodology';
import styles from '../StageForm.module.css';

export interface IOProps {
  readonly stage: Stage;
  readonly draft: Methodology;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

function refEq(a: ArtifactRef, b: ArtifactRef): boolean {
  return a.stage === b.stage && a.artifact === b.artifact;
}

export function IO({ stage, draft, onUpdate }: IOProps): ReactElement {
  const { t } = useTranslation();

  const selfIndex = draft.stages.findIndex((s) => s.id === stage.id);
  const upstreamStages: readonly Stage[] =
    selfIndex < 0
      ? []
      : draft.stages.filter((s, i) => i < selfIndex && s.id !== stage.id);

  function defaultArtifactFor(stageId: string): string {
    const found = draft.stages.find((s) => s.id === stageId);
    return found?.contract.output.path ?? `${stageId}.md`;
  }

  const inputs: readonly ArtifactRef[] = stage.contract.input ?? [];

  function patchInputs(next: readonly ArtifactRef[]): void {
    onUpdate({ contract: { ...stage.contract, input: next } });
  }

  function updateInput(i: number, ref: ArtifactRef): void {
    const next = inputs.slice();
    next[i] = ref;
    patchInputs(next);
  }

  function removeInput(i: number): void {
    patchInputs(inputs.filter((_, idx) => idx !== i));
  }

  function addInput(): void {
    const seed: ArtifactRef = {
      stage: upstreamStages[0]?.id ?? '',
      artifact: '',
    };
    patchInputs([...inputs, seed]);
  }

  function updateOutput(spec: ArtifactSpec): void {
    onUpdate({ contract: { ...stage.contract, output: spec } });
  }

  // v1 reachable-artifacts set: upstream stages' output artifacts only.
  const reachableArtifacts: readonly ArtifactRef[] = upstreamStages.map((s) => ({
    stage: s.id,
    artifact: s.contract.output.path,
  }));

  const essentials = stage.context_essentials ?? [];

  function isSelected(ref: ArtifactRef): boolean {
    return essentials.some((e) => refEq(e, ref));
  }

  function toggleEssential(ref: ArtifactRef, on: boolean): void {
    let next: readonly ArtifactRef[];
    if (on) {
      next = essentials.some((e) => refEq(e, ref))
        ? essentials
        : [...essentials, ref];
    } else {
      next = essentials.filter((e) => !refEq(e, ref));
    }
    onUpdate({ context_essentials: next.length === 0 ? undefined : next });
  }

  return (
    <div className={styles.tabBody}>
      <fieldset className={styles.fieldset}>
        <legend>{t('library.edit.io.inputs', 'Inputs')}</legend>
        {inputs.map((ref, i) => (
          <div key={i} className={styles.row}>
            <select
              value={ref.stage}
              onChange={(e) =>
                updateInput(i, { stage: e.target.value, artifact: ref.artifact })
              }
            >
              {upstreamStages.length === 0 && (
                <option value="">
                  {t('library.edit.io.noUpstream', 'No upstream stages yet')}
                </option>
              )}
              {upstreamStages.map((us) => (
                <option key={us.id} value={us.id}>
                  {us.id}
                </option>
              ))}
            </select>
            <input
              value={ref.artifact}
              onChange={(e) =>
                updateInput(i, { stage: ref.stage, artifact: e.target.value })
              }
              placeholder={defaultArtifactFor(ref.stage)}
            />
            <button
              type="button"
              onClick={() => removeInput(i)}
              aria-label={t('library.edit.io.removeInput', 'Remove')}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={addInput} className={styles.addButton}>
          {t('library.edit.io.addInput', '+ Add input')}
        </button>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>{t('library.edit.io.output', 'Output')}</legend>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            {t('library.edit.io.outputPath', 'Path')}
          </span>
          <input
            value={stage.contract.output.path}
            onChange={(e) =>
              updateOutput({
                path: e.target.value,
                format: stage.contract.output.format,
              })
            }
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            {t('library.edit.io.outputFormat', 'Format')}
          </span>
          <select
            value={stage.contract.output.format ?? 'markdown'}
            onChange={(e) =>
              updateOutput({
                path: stage.contract.output.path,
                format: e.target.value as ArtifactFormat,
              })
            }
          >
            <option value="markdown">
              {t('library.edit.io.formatMarkdown', 'Markdown')}
            </option>
            <option value="plaintext">
              {t('library.edit.io.formatPlaintext', 'Plain text')}
            </option>
          </select>
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>{t('library.edit.io.contextEssentials', 'Context essentials')}</legend>
        <small className={styles.help}>
          {t(
            'library.edit.io.contextEssentialsHelp',
            'Artifacts the engine must keep in context across compaction.',
          )}
        </small>
        {reachableArtifacts.length === 0 ? (
          <small className={styles.help}>
            {t('library.edit.io.noUpstream', 'No upstream stages yet')}
          </small>
        ) : (
          reachableArtifacts.map((a) => (
            <label key={`${a.stage}|${a.artifact}`} className={styles.checkbox}>
              <input
                type="checkbox"
                checked={isSelected(a)}
                onChange={(e) => toggleEssential(a, e.target.checked)}
              />
              {a.stage} / {a.artifact}
            </label>
          ))
        )}
      </fieldset>
    </div>
  );
}
