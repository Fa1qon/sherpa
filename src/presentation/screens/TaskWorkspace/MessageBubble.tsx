// src/presentation/screens/TaskWorkspace/MessageBubble.tsx
import { useState, useEffect, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import type { AgentMessage, ToolCall } from '../../../core/domain/agent';
import { toolCallSummary, ToolCallDetail } from './ToolCallRenderers';
import styles from './TaskWorkspace.module.css';

interface Props {
  readonly message: AgentMessage;
  /** When true and role==='agent', render with click-to-expand toggle, default hidden. */
  readonly initiallyCollapsed?: boolean;
}

export function MessageBubble({ message, initiallyCollapsed = false }: Props): ReactElement {
  if (message.role === 'tool' && message.toolCall) {
    return <ToolCallBubble toolCall={message.toolCall} />;
  }

  if (message.role === 'agent') {
    return <AgentTextBubble text={message.text} initiallyCollapsed={initiallyCollapsed} />;
  }

  const isMarkdownRole = message.role === 'system';

  return (
    <div className={styles.bubble} data-role={message.role}>
      {isMarkdownRole ? (
        <div className={styles.agentText}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
        </div>
      ) : (
        <div className={styles.text}>{message.text}</div>
      )}
    </div>
  );
}

// Strip CLI-era stage tags like "[W1 | #abc Task title]" from the first line.
// The UI shows stage info in the sidebar panel; the inline tag is redundant.
function stripStageTag(text: string): string {
  return text.replace(/^\[(?:W\d+(?:\.\d+)?|R\d+)[^\]]*\]\s*\n?/, '');
}

function AgentTextBubble({ text, initiallyCollapsed }: { text: string; initiallyCollapsed: boolean }): ReactElement {
  const displayText = stripStageTag(text);
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!initiallyCollapsed);

  useEffect(() => {
    if (initiallyCollapsed) setExpanded(false);
  }, [initiallyCollapsed]);

  return (
    <div className={styles.agentMsg} data-role="agent">
      <div className={styles.agentHeader}>
        <AgentIcon />
        <span className={styles.agentLabel}>SHERPA</span>
      </div>
      {initiallyCollapsed && (
        <button
          type="button"
          className={styles.englishToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? t('chat.hideEnglish') : t('chat.showEnglish')}
        </button>
      )}
      {expanded && (
        <div className={styles.agentText}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ToolCallBubble({ toolCall }: { toolCall: ToolCall }): ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  // AskUserQuestion is rendered by AskUserQuestionPopup — skip the tool-call row.
  if (toolCall.name === 'AskUserQuestion') return null;
  const summary = toolCallSummary(toolCall);
  return (
    <div className={styles.toolCall} data-status={toolCall.status}>
      <button
        type="button"
        className={styles.toolHeader}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.toolChevron} aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className={styles.toolSummary}>{summary}</span>
        <span className={styles.toolStatusDot} data-status={toolCall.status} aria-hidden="true" />
      </button>
      {expanded && (
        <div className={styles.toolDetail}>
          <ToolCallDetail toolCall={toolCall} />
          {toolCall.result !== undefined && toolCall.result.length > 0 && (
            <pre className={styles.toolResult}>{toolCall.result}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function AgentIcon(): ReactElement {
  return (
    <svg
      className={styles.agentIcon}
      width="16"
      height="12"
      viewBox="0 0 20 14"
      aria-hidden="true"
    >
      <path
        d="M 1 13 L 7 2 L 11 9 L 14 4 L 19 13 Z"
        fill="var(--accent)"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

