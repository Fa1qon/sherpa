// src/presentation/screens/TaskWorkspace/ChatThread.tsx
import { type ReactElement, useEffect, useRef } from 'react';
import type { AgentMessage } from '../../../core/domain/agent';
import { MessageBubble } from './MessageBubble';
import { StageBanner, type StageTransition } from './StageBanner';
import styles from './TaskWorkspace.module.css';

interface Props {
  readonly messages: readonly AgentMessage[];
  readonly stageTransitions?: readonly StageTransition[];
}

export function ChatThread({ messages, stageTransitions }: Props): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div className={styles.thread} ref={ref}>
      {messages.length === 0 && (
        <div className={styles.hint}>Type a message below to start.</div>
      )}
      {messages.flatMap((m, i) => {
        const next = messages[i + 1];
        const nextTs = next?.timestamp ?? '9999-99-99';

        const banners = (stageTransitions ?? [])
          .filter((tr) => tr.ts >= (m.timestamp ?? '') && tr.ts < nextTs)
          .map((tr) => <StageBanner key={`tr-${tr.ts}`} transition={tr} />);

        return [
          <MessageBubble key={m.id} message={m} />,
          ...banners,
        ];
      })}
      {/* Thinking state is shown in WorkingIndicator at the bottom — no duplicate bubble needed. */}
    </div>
  );
}
