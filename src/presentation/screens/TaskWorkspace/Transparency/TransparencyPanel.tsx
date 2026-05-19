// src/presentation/screens/TaskWorkspace/Transparency/TransparencyPanel.tsx
//
// Renders paired tool calls from the task's trace, with 3-second live polling.
// ADR-001: no imports from src/main — uses ipcClient for testability.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcClient } from '../../../../renderer/ipc/client';
import { aggregateToolCalls, type TraceEventLike, type ToolCall } from './trace_parser';
import { ToolCallCard } from './ToolCallCard';
import { CallTreePanel } from './CallTreePanel';
import styles from './TransparencyPanel.module.css';

interface Props {
  projectPath: string;
  taskId: string;
}

export function TransparencyPanel({ projectPath, taskId }: Props): ReactElement {
  const { t } = useTranslation();
  const [view, setView] = useState<'list' | 'tree'>('list');
  const [events, setEvents] = useState<TraceEventLike[]>([]);
  const [filter, setFilter] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    if (!projectPath || !taskId) return;
    let cancelled = false;

    const load = (): void => {
      const p = projectPath;
      const tid = taskId;
      void (async () => {
        try {
          const result = await ipcClient.trace().read({ projectPath: p, taskId: tid });
          if (!cancelled) setEvents(result as unknown as TraceEventLike[]);
        } catch {
          // Ignore errors during polling — stale data is fine
        }
      })();
    };

    load();
    const id = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [projectPath, taskId]);

  const calls: ToolCall[] = useMemo(() => aggregateToolCalls(events), [events]);

  const filtered = useMemo(() => {
    let result = calls;
    if (filter) {
      const needle = filter.toLowerCase();
      result = result.filter(
        (c) =>
          c.toolName.toLowerCase().includes(needle) ||
          JSON.stringify(c.input ?? '').toLowerCase().includes(needle),
      );
    }
    if (errorsOnly) result = result.filter((c) => c.isError === true);
    return result;
  }, [calls, filter, errorsOnly]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.viewToggle}
          data-active={view === 'list'}
          onClick={() => setView('list')}
        >
          {t('callTree.list', 'List')}
        </button>
        <button
          type="button"
          className={styles.viewToggle}
          data-active={view === 'tree'}
          onClick={() => setView('tree')}
        >
          {t('callTree.tree', 'Tree')}
        </button>
        {view === 'list' && (
          <>
            <input
              type="text"
              placeholder={t('transparency.filter', 'Filter tools…')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={styles.search}
            />
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              {t('transparency.errorsOnly', 'Errors only')}
            </label>
            <span className={styles.count}>
              {filtered.length} / {calls.length}
            </span>
          </>
        )}
      </div>
      {view === 'list' ? (
        <div className={styles.list}>
          {filtered.length === 0 ? (
            <p className={styles.empty}>{t('transparency.empty', 'No tool calls yet')}</p>
          ) : (
            filtered.map((c) => <ToolCallCard key={c.callId} call={c} />)
          )}
        </div>
      ) : (
        <CallTreePanel calls={calls} />
      )}
    </div>
  );
}
