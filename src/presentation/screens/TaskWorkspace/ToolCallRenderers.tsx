import type { ReactElement } from 'react';
import type { ToolCall } from '../../../core/domain/agent';

// ---------- Summary (one-liner for collapsed header) ----------

export function toolCallSummary(tc: ToolCall): string {
  switch (tc.name) {
    case 'TodoWrite': {
      const todos = tc.args['todos'];
      const count = Array.isArray(todos) ? todos.length : 0;
      return `TodoWrite (${count} task${count === 1 ? '' : 's'})`;
    }
    case 'AskUserQuestion': {
      const questions = tc.args['questions'];
      const first = Array.isArray(questions) ? (questions[0] as Record<string, unknown> | undefined) : undefined;
      const q = typeof first?.['question'] === 'string' ? first['question'] : '';
      const truncated = q.length > 60 ? `${q.slice(0, 57)}…` : q;
      return truncated ? `AskUserQuestion — "${truncated}"` : 'AskUserQuestion';
    }
    case 'Agent': {
      const desc = typeof tc.args['description'] === 'string' ? tc.args['description'] : '';
      const truncated = desc.length > 60 ? `${desc.slice(0, 57)}…` : desc;
      return truncated ? `Agent — ${truncated}` : 'Agent';
    }
    default: {
      const primaryKey =
        tc.name === 'Bash' ? 'command' :
        'file_path' in tc.args ? 'file_path' :
        Object.keys(tc.args)[0] ?? '';
      const primaryVal = primaryKey ? String(tc.args[primaryKey] ?? '') : '';
      const truncated = primaryVal.length > 60 ? `${primaryVal.slice(0, 57)}…` : primaryVal;
      return primaryVal ? `${tc.name} ${truncated}` : tc.name;
    }
  }
}

// ---------- Detail (expanded body) ----------

export function ToolCallDetail({ toolCall: tc }: { readonly toolCall: ToolCall }): ReactElement {
  switch (tc.name) {
    case 'TodoWrite':
      return <TodoWriteDetail args={tc.args} />;
    case 'AskUserQuestion':
      return <AskUserQuestionDetail args={tc.args} />;
    default:
      return <GenericDetail args={tc.args} />;
  }
}

// Status → emoji
const STATUS_ICON: Record<string, string> = {
  done: '✓',
  completed: '✓',
  in_progress: '⏳',
  pending: '○',
};

interface TodoItem { content: string; status: string; activeForm?: string }

function TodoWriteDetail({ args }: { readonly args: Record<string, unknown> }): ReactElement {
  const todos = Array.isArray(args['todos']) ? (args['todos'] as TodoItem[]) : [];
  return (
    <ul style={{ margin: 0, padding: '4px 0 0 0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {todos.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 6, fontSize: 11, alignItems: 'flex-start' }}>
          <span style={{ color: item.status === 'done' || item.status === 'completed' ? 'var(--accent)' : 'var(--fg-muted)', flexShrink: 0 }}>
            {STATUS_ICON[item.status] ?? '○'}
          </span>
          <span style={{ color: 'var(--fg-default)', textDecoration: item.status === 'done' || item.status === 'completed' ? 'line-through' : 'none' }}>
            {item.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface QuestionOption { label: string; description?: string }
interface Question { question: string; header?: string; multiSelect?: boolean; options: QuestionOption[] }

function AskUserQuestionDetail({ args }: { readonly args: Record<string, unknown> }): ReactElement {
  const questions = Array.isArray(args['questions']) ? (args['questions'] as Question[]) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {questions.map((q, qi) => (
        <div key={qi}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-default)', marginBottom: 4 }}>
            {q.question}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {q.options.map((opt, oi) => (
              <li key={oi} style={{ fontSize: 11, paddingLeft: 8 }}>
                <span style={{ color: 'var(--accent)', marginRight: 4 }}>›</span>
                <span style={{ color: 'var(--fg-default)', fontWeight: 500 }}>{opt.label}</span>
                {opt.description && (
                  <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>{opt.description}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function GenericDetail({ args }: { readonly args: Record<string, unknown> }): ReactElement {
  return (
    <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--fg-default)' }}>
      {JSON.stringify(args, null, 2)}
    </pre>
  );
}
