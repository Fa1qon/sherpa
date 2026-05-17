import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConditionExpr } from '../../../core/domain/methodology';
import {
  parseConditionExpr,
  formatConditionExpr,
} from '../../../core/domain/condition_expr';
import styles from './ExpressionBuilder.module.css';

export type ExpressionContext = 'gate' | 'edge_branch' | 'activation';

export interface ExpressionBuilderProps {
  readonly value: ConditionExpr | undefined;
  readonly onChange: (next: ConditionExpr | undefined) => void;
  readonly context: ExpressionContext;
  readonly placeholder?: string;
}

interface PaletteItem {
  readonly label: string;
  readonly snippet: string;
}

const PALETTE: Record<ExpressionContext, ReadonlyArray<PaletteItem>> = {
  gate: [
    { label: "artifact_exists('…')", snippet: "artifact_exists('')" },
    {
      label: "all_reviewers_passed('recommended')",
      snippet: "all_reviewers_passed('recommended')",
    },
    {
      label: "confidence_at_least('medium')",
      snippet: "confidence_at_least('medium')",
    },
    { label: 'scope_unchanged()', snippet: 'scope_unchanged()' },
  ],
  edge_branch: [
    { label: 'meta.fix_cycles >= 3', snippet: 'meta.fix_cycles >= 3' },
    {
      label: "signals.confidence == 'high'",
      snippet: "signals.confidence == 'high'",
    },
    { label: "artifact_exists('…')", snippet: "artifact_exists('')" },
    { label: 'scope_unchanged()', snippet: 'scope_unchanged()' },
  ],
  activation: [
    { label: "meta.x == 'value'", snippet: "meta.x == 'value'" },
    {
      label: "confidence_at_least('medium')",
      snippet: "confidence_at_least('medium')",
    },
    { label: 'scope_unchanged()', snippet: 'scope_unchanged()' },
  ],
};

export function ExpressionBuilder({
  value,
  onChange,
  context,
  placeholder,
}: ExpressionBuilderProps): ReactElement {
  const { t } = useTranslation();
  const [text, setText] = useState(value?.expr ?? '');

  const parseRes = useMemo(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    return parseConditionExpr(trimmed);
  }, [text]);

  function commit(next: string): void {
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      onChange(undefined);
      return;
    }
    const r = parseConditionExpr(trimmed);
    if (r.ok) onChange({ expr: formatConditionExpr(r.ast) });
    // Invalid input → keep showing in textarea; do not commit to IR.
  }

  function insert(snippet: string): void {
    setText((cur) => (cur.trim().length > 0 ? `${cur} AND ${snippet}` : snippet));
  }

  return (
    <div className={styles.root}>
      <textarea
        className={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        placeholder={
          placeholder ??
          "e.g. artifact_exists('plan.md') AND confidence_at_least('medium')"
        }
        spellCheck={false}
        rows={3}
        data-testid="expression-builder-textarea"
      />
      {parseRes && !parseRes.ok && (
        <div className={styles.error} data-testid="expression-builder-error">
          {t('expressionBuilder.parseError', 'Parse error at position {{pos}}: {{msg}}', {
            pos: parseRes.position,
            msg: parseRes.message,
          })}
        </div>
      )}
      <div className={styles.palette} data-testid="expression-builder-palette">
        {PALETTE[context].map((item) => (
          <button
            type="button"
            key={item.label}
            className={styles.paletteButton}
            onClick={() => insert(item.snippet)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
