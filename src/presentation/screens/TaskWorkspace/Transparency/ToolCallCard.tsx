// src/presentation/screens/TaskWorkspace/Transparency/ToolCallCard.tsx
//
// Collapsible card for a single paired tool call. Shows tool name, duration,
// success/error badge, and expandable input / output sections.
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, AlertCircle, Check } from 'lucide-react';
import type { ToolCall } from './trace_parser';
import styles from './ToolCallCard.module.css';

interface Props {
  call: ToolCall;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallCard({ call }: Props): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className={`${styles.card} ${call.isError === true ? styles.error : ''}`}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={styles.tool}>{call.toolName}</span>
        {call.stageId && <span className={styles.stage}>{call.stageId}</span>}
        {call.isError === true ? (
          <AlertCircle size={12} className={styles.errorIcon} />
        ) : call.output !== undefined ? (
          <Check size={12} className={styles.okIcon} />
        ) : null}
        <span className={styles.duration}>{fmtMs(call.durationMs)}</span>
      </button>
      {open && (
        <div className={styles.body}>
          <details open className={styles.section}>
            <summary>{t('transparency.input', 'Input')}</summary>
            <pre className={styles.code}>{fmt(call.input)}</pre>
          </details>
          {call.output !== undefined && (
            <details open className={styles.section}>
              <summary>{t('transparency.output', 'Output')}</summary>
              <pre className={styles.code}>{fmt(call.output).slice(0, 5000)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
