// src/presentation/screens/TaskWorkspace/WorkingIndicator.tsx
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './WorkingIndicator.module.css';

export interface WorkingCounters {
  readonly toolUses: number;
  readonly elapsedSec: number;
  readonly estTokens: number;
  readonly linesWritten: number;
  readonly lastToolName: string | null;
  readonly onOpenDrawer?: () => void;
}

const TOOL_VERBS: Record<string, string> = {
  Read: 'Читаю',
  Write: 'Записываю',
  Edit: 'Редактирую',
  MultiEdit: 'Редактирую',
  Bash: 'Выполняю',
  Grep: 'Ищу',
  Glob: 'Сканирую',
  LS: 'Смотрю',
  WebSearch: 'Ищу в сети',
  WebFetch: 'Загружаю',
  Agent: 'Запускаю агент',
  Task: 'Запускаю агент',
  NotebookEdit: 'Редактирую',
  NotebookRead: 'Читаю',
  TodoWrite: 'Планирую',
};

const CLIMBING = [
  'карабкаюсь', 'взбираюсь', 'преодолеваю', 'штурмую', 'одолеваю',
  'поднимаюсь', 'прокладываю путь', 'держусь', 'балансирую', 'продвигаюсь',
  'тяну', 'цепляюсь', 'форсирую', 'осиливаю', 'пробираюсь',
];

function resolveStatus(counters: WorkingCounters): string {
  if (counters.lastToolName) {
    return TOOL_VERBS[counters.lastToolName] ?? 'Думаю';
  }
  return CLIMBING[Math.floor(counters.elapsedSec / 2) % CLIMBING.length] ?? 'карабкаюсь';
}

interface Props {
  readonly counters: WorkingCounters;
}

export function WorkingIndicator({ counters }: Props): ReactElement {
  const { t } = useTranslation();
  const statusText = resolveStatus(counters);
  return (
    <div className={styles.indicator} role="status" aria-live="polite">
      <ClimbingIcon />
      <span className={styles.statusText}>{statusText}</span>
      <span className={styles.sep}>·</span>
      <span className={styles.counters}>
        <Counter label={t('chat.counter.tools', ' tools')} value={counters.toolUses} />
        <span className={styles.sep}>·</span>
        <Counter label={t('chat.counter.time', 's')} value={counters.elapsedSec} />
        <span className={styles.sep}>·</span>
        <Counter label={t('chat.counter.tokens', ' tokens')} value={counters.estTokens} prefix="≈" />
        {counters.linesWritten > 0 && (
          <>
            <span className={styles.sep}>·</span>
            <Counter label={t('chat.counter.lines', ' lines')} value={counters.linesWritten} />
          </>
        )}
      </span>
      {counters.onOpenDrawer && (
        <button
          type="button"
          title={t('chat.sessionDrawer', 'Session')}
          onClick={counters.onOpenDrawer}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            color: 'var(--fg-muted)',
            fontSize: 10,
            padding: '1px 6px',
            cursor: 'pointer',
            marginLeft: 4,
          }}
          data-testid="open-session-drawer"
        >
          ↗
        </button>
      )}
    </div>
  );
}

function ClimbingIcon(): ReactElement {
  // Two-peak ridge silhouette that mirrors the brand mountain (left peak
  // taller, right peak shorter). Climber dot walks the ridge then drops
  // along the base to loop — last 10% of the cycle is the walk-back at
  // baseline-y so the reset reads as motion, not teleport.
  //
  // SMIL <animate> on geometry attributes rather than CSS transform —
  // SVG transform semantics on circle's cx/cy don't reliably honor user-
  // unit translates across Chromium versions.
  return (
    <svg className={styles.climber} width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
      {/* Ridge outline */}
      <path
        d="M 1 13 L 7 2 L 11 9 L 14 4 L 19 13 Z"
        fill="var(--accent)"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Snow caps — small triangles at the tips of each peak */}
      <path
        d="M 5.5 4.75 L 7 2 L 8.5 4.75 Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      <path
        d="M 13 5.83 L 14 4 L 15 5.83 Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      {/* Climber dot — walks left ridge up, down to valley, right ridge up, down to base, walks back along base */}
      <circle r="1.4" fill="currentColor">
        <animate
          attributeName="cx"
          values="1;7;11;14;19;1"
          keyTimes="0;0.22;0.45;0.67;0.9;1"
          dur="2.8s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="cy"
          values="13;2;9;4;13;13"
          keyTimes="0;0.22;0.45;0.67;0.9;1"
          dur="2.8s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

function Counter({ label, value, prefix = '' }: { label: string; value: number; prefix?: string }): ReactElement {
  return <span className={styles.counter}>{prefix}{value.toLocaleString()}{label}</span>;
}
