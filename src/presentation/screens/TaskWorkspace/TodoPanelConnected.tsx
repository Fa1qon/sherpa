import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useTask } from '../../../renderer/store/task';
import type { AgentMessage } from '../../../core/domain/agent';

// Stable empty reference so the Zustand selector never returns a new [] identity,
// which would cause an infinite re-render loop (React error #185).
const EMPTY_THREAD: readonly AgentMessage[] = [];

interface TodoItem {
  content: string;
  status: string;
  activeForm?: string;
}

const STATUS_ICON: Record<string, string> = {
  completed: '✓',
  done: '✓',
  in_progress: '⏳',
  pending: '○',
};

function getLatestTodos(thread: readonly AgentMessage[]): TodoItem[] {
  for (let i = thread.length - 1; i >= 0; i--) {
    const msg = thread[i];
    if (msg?.toolCall?.name === 'TodoWrite') {
      const raw = msg.toolCall.args['todos'];
      if (Array.isArray(raw)) return raw as TodoItem[];
    }
  }
  return [];
}

export function TodoPanelConnected(): ReactElement {
  const { t } = useTranslation();
  const thread = useTask((s) => s.current?.thread ?? EMPTY_THREAD);
  const todos = getLatestTodos(thread);

  if (todos.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--fg-muted)', fontSize: 12, fontStyle: 'italic' }}>
        {t('todoPanel.empty', 'Список задач пуст')}
      </div>
    );
  }

  const done = todos.filter((t) => t.status === 'completed' || t.status === 'done').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '6px 12px',
        fontSize: 11,
        color: 'var(--fg-muted)',
        borderBottom: '1px solid var(--border)',
      }}>
        {done}/{todos.length}
      </div>
      <ul style={{ margin: 0, padding: '4px 0', listStyle: 'none' }}>
        {todos.map((item, i) => {
          const isDone = item.status === 'completed' || item.status === 'done';
          const isActive = item.status === 'in_progress';
          const label = isActive ? (item.activeForm ?? item.content) : item.content;
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '5px 12px',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
              }}
            >
              <span style={{
                fontSize: 11,
                flexShrink: 0,
                marginTop: 1,
                color: isDone ? 'var(--accent)' : isActive ? 'var(--fg-default)' : 'var(--fg-muted)',
              }}>
                {STATUS_ICON[item.status] ?? '○'}
              </span>
              <span style={{
                fontSize: 12,
                color: isDone ? 'var(--fg-muted)' : 'var(--fg-default)',
                textDecoration: isDone ? 'line-through' : 'none',
                lineHeight: 1.4,
              }}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
