import { type ReactElement, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Methodology, Edge, EdgeConditionKind } from '../../../core/domain/methodology';

interface Props {
  draft: Methodology;
  edgeIndex: number;
  onChange: (next: Methodology) => void;
  onDelete: () => void;
  onClose: () => void;
}

const KINDS: readonly EdgeConditionKind[] = ['always', 'gate-pass', 'gate-fail', 'branch'];

export function EdgePopover({ draft, edgeIndex, onChange, onDelete, onClose }: Props): ReactElement | null {
  const { t } = useTranslation();
  const edge = draft.edges[edgeIndex];

  const update = useCallback(
    (patch: Partial<Edge>) => {
      if (!edge) return;
      const nextEdges = draft.edges.map((e, i) => (i === edgeIndex ? { ...e, ...patch } : e));
      onChange({ ...draft, edges: nextEdges });
    },
    [draft, edge, edgeIndex, onChange],
  );

  if (!edge) return null;

  const setKind = (kind: EdgeConditionKind): void => {
    if (kind === 'always') update({ condition: { kind: 'always' } });
    else if (kind === 'gate-pass') update({ condition: { kind: 'gate-pass' } });
    else if (kind === 'gate-fail') update({ condition: { kind: 'gate-fail' } });
    else update({ condition: { kind: 'branch', expr: '' } });
  };

  return (
    <div
      data-testid="edge-popover"
      style={{
        position: 'absolute', top: 16, right: 16, zIndex: 10,
        background: 'var(--bg-elevated)', padding: 12, borderRadius: 6,
        border: '1px solid var(--border-default)', minWidth: 260,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 12 }}>
          {t('library.edit.edge', 'Edge')}: {edge.from} → {edge.to}
        </strong>
        <button onClick={onClose} aria-label="close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
      </div>

      <label style={{ fontSize: 12 }}>
        {t('library.edit.condition', 'condition')}
        <select
          value={edge.condition.kind}
          onChange={(e) => setKind(e.target.value as EdgeConditionKind)}
          style={{ width: '100%', marginTop: 4 }}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </label>

      {edge.condition.kind === 'gate-fail' && (
        <label style={{ fontSize: 12 }}>
          {t('library.edit.maxCycles', 'maxCycles')}
          <input
            type="number"
            min={1}
            value={edge.condition.maxCycles ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const n = v === '' ? undefined : Number.parseInt(v, 10);
              const cond = (n === undefined || Number.isNaN(n))
                ? { kind: 'gate-fail' as const }
                : { kind: 'gate-fail' as const, maxCycles: n };
              update({ condition: cond });
            }}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      )}

      {edge.condition.kind === 'branch' && (
        <label style={{ fontSize: 12 }}>
          {t('library.edit.expr', 'expr')}
          <input
            value={edge.condition.expr}
            onChange={(e) => update({ condition: { kind: 'branch', expr: e.target.value } })}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      )}

      <label style={{ fontSize: 12 }}>
        {t('library.edit.label', 'label (optional)')}
        <input
          value={edge.label ?? ''}
          onChange={(e) => update({ label: e.target.value || undefined })}
          style={{ width: '100%', marginTop: 4 }}
        />
      </label>

      <button
        onClick={onDelete}
        style={{
          fontSize: 12, padding: '4px 8px', borderRadius: 4,
          background: 'transparent', border: '1px solid var(--error)',
          color: 'var(--error)', cursor: 'pointer',
        }}
      >
        {t('library.edit.deleteEdge', 'Delete edge')}
      </button>
    </div>
  );
}
