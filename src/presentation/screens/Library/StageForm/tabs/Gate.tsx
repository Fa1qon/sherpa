// src/presentation/screens/Library/StageForm/tabs/Gate.tsx
// Plan 7 Task 10 — Gate tab editor.
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConditionExpr,
  Gate,
  GateItem,
  GateItemKind,
  GateKind,
  Stage,
} from '../../../../../core/domain/methodology';
import { ExpressionBuilder } from '../../../../components/ExpressionBuilder';
import styles from '../StageForm.module.css';

export interface GateProps {
  readonly stage: Stage;
  readonly onUpdate: (patch: Partial<Stage>) => void;
}

const KIND_OPTIONS: ReadonlyArray<GateItemKind> = [
  'artifact_written',
  'reviewer_pass',
  'user_confirmed',
  'completeness_check',
  'custom',
];

const KIND_LABEL_KEY: Record<GateItemKind, string> = {
  artifact_written:    'library.edit.gate.kinds.artifactWritten',
  reviewer_pass:       'library.edit.gate.kinds.reviewerPass',
  user_confirmed:      'library.edit.gate.kinds.userConfirmed',
  completeness_check:  'library.edit.gate.kinds.completenessCheck',
  custom:              'library.edit.gate.kinds.custom',
};

export function GateTab({ stage, onUpdate }: GateProps): ReactElement {
  const { t } = useTranslation();
  const gate: Gate = stage.gate ?? { kind: 'standard', items: [] };

  function commitGate(next: Gate): void {
    if (next.items.length === 0 && next.kind === 'standard') {
      onUpdate({ gate: undefined });
      return;
    }
    onUpdate({ gate: next });
  }

  function setKind(kind: GateKind): void {
    commitGate({ ...gate, kind });
  }

  function updateItem(i: number, patch: Partial<GateItem>): void {
    const next = gate.items.slice();
    const cur = next[i];
    if (!cur) return;
    next[i] = { ...cur, ...patch };
    commitGate({ ...gate, items: next });
  }

  function addItem(): void {
    let n = gate.items.length + 1;
    let id = `item_${n}`;
    while (gate.items.some((it) => it.id === id)) { n += 1; id = `item_${n}`; }
    const fresh: GateItem = { id, label: id, kind: 'artifact_written' };
    commitGate({ ...gate, items: [...gate.items, fresh] });
  }

  function removeItem(i: number): void {
    const next = gate.items.filter((_, idx) => idx !== i);
    commitGate({ ...gate, items: next });
  }

  function moveItem(i: number, delta: -1 | 1): void {
    const j = i + delta;
    if (j < 0 || j >= gate.items.length) return;
    const next = gate.items.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    commitGate({ ...gate, items: next });
  }

  return (
    <div className={styles.gateTab}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('library.edit.gate.kind', 'Gate kind')}</span>
        <select
          value={gate.kind}
          onChange={(e) => setKind(e.target.value as GateKind)}
          data-testid="gate-kind"
        >
          <option value="standard">{t('library.edit.gate.kindStandard', 'Standard')}</option>
          <option value="comprehension">{t('library.edit.gate.kindComprehension', 'Comprehension (AI asks a domain question)')}</option>
        </select>
      </label>

      <h4 className={styles.gateItemsHeader}>{t('library.edit.gate.items', 'Items')}</h4>
      {gate.items.length === 0 && (
        <p className={styles.help}>{t('library.edit.gate.empty', "No items yet. Click '+ Add item' to add one.")}</p>
      )}
      <ol className={styles.gateItemList}>
        {gate.items.map((item, i) => (
          <li key={item.id} className={styles.gateItem} data-testid={`gate-item-${item.id}`}>
            <div className={styles.gateItemHeader}>
              <input
                value={item.id}
                onChange={(e) => updateItem(i, { id: e.target.value })}
                placeholder={t('library.edit.gate.idLabel', 'id')}
                aria-label={t('library.edit.gate.idLabel', 'id')}
                data-testid={`gate-item-${item.id}-id`}
              />
              <input
                value={item.label}
                onChange={(e) => updateItem(i, { label: e.target.value })}
                placeholder={t('library.edit.gate.labelLabel', 'Label')}
                aria-label={t('library.edit.gate.labelLabel', 'Label')}
                data-testid={`gate-item-${item.id}-label`}
              />
              <select
                value={item.kind}
                onChange={(e) => updateItem(i, { kind: e.target.value as GateItemKind })}
                aria-label={t('library.edit.gate.kindLabel', 'Kind')}
                data-testid={`gate-item-${item.id}-kind`}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{t(KIND_LABEL_KEY[k], k)}</option>
                ))}
              </select>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={item.hard_stop === true}
                  onChange={(e) => updateItem(i, { hard_stop: e.target.checked ? true : undefined })}
                  data-testid={`gate-item-${item.id}-hardStop`}
                />
                <small>{t('library.edit.gate.hardStop', 'Hard stop')}</small>
              </label>
              <div className={styles.reorderButtons}>
                <button
                  type="button"
                  onClick={() => moveItem(i, -1)}
                  aria-label={t('library.edit.gate.moveUp', 'Move up')}
                  disabled={i === 0}
                  data-testid={`gate-item-${item.id}-up`}
                >▲</button>
                <button
                  type="button"
                  onClick={() => moveItem(i, 1)}
                  aria-label={t('library.edit.gate.moveDown', 'Move down')}
                  disabled={i === gate.items.length - 1}
                  data-testid={`gate-item-${item.id}-down`}
                >▼</button>
              </div>
              <button
                type="button"
                onClick={() => removeItem(i)}
                aria-label={t('library.edit.gate.removeItem', 'Remove item')}
                data-testid={`gate-item-${item.id}-remove`}
              >×</button>
            </div>
            <details className={styles.gateItemDetails}>
              <summary>{t('library.edit.gate.autoPassCondition', 'Auto-pass condition')}</summary>
              <ExpressionBuilder
                value={item.auto_pass_when}
                onChange={(next: ConditionExpr | undefined) => updateItem(i, { auto_pass_when: next })}
                context="gate"
              />
            </details>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={addItem}
        className={styles.addButton}
        data-testid="gate-add-item"
      >+ {t('library.edit.gate.addItem', 'Add item')}</button>
    </div>
  );
}
