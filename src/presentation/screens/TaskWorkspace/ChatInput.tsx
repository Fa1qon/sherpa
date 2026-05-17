// src/presentation/screens/TaskWorkspace/ChatInput.tsx
import { type ReactElement, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTask } from '../../../renderer/store/task';
import { useProject } from '../../../renderer/store/project';
import { useDraft } from '../../../renderer/hooks/useDraft';
import styles from './TaskWorkspace.module.css';

interface ChatInputProps {
  readonly onBeforeSend?: (text: string) => Promise<void>;
  readonly onSettingsToggle?: () => void;
  readonly settingsChip?: string;
}

export function ChatInput({ onBeforeSend, onSettingsToggle, settingsChip }: ChatInputProps = {}): ReactElement {
  const { t } = useTranslation();
  const taskId = useTask((s) => s.current?.id ?? null);
  const [text, setText, clearDraft] = useDraft(taskId);
  const sending = useTask((s) => s.sending);
  const send = useTask((s) => s.sendUserMessage);
  const projectPath = useProject((s) => s.current?.path ?? '');

  const submit = async (): Promise<void> => {
    const v = text.trim();
    if (!v || sending || !projectPath) return;
    if (onBeforeSend) {
      try {
        await onBeforeSend(v);
      } catch {
        return;
      }
    }
    clearDraft();
    await send(projectPath, v);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className={styles.inputBox}>
      <div className={styles.inputToolbar}>
        {settingsChip && (
          <button
            type="button"
            className={styles.settingsChip}
            onClick={onSettingsToggle}
            aria-label={t('chat.settingsChip', 'Настройки')}
          >
            {settingsChip}
          </button>
        )}
        <button
          type="button"
          className={styles.gearBtn}
          onClick={onSettingsToggle}
          aria-label={t('chat.settings', 'Настройки')}
        >
          ⚙
        </button>
      </div>
      <div className={styles.inputInner}>
        <textarea
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={t('chat.placeholder', 'Напишите сообщение… (Enter — отправить, Shift+Enter — перенос)')}
          disabled={sending}
          rows={3}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={() => { void submit(); }}
          disabled={!text.trim() || sending || !projectPath}
          aria-label={t('chat.send', 'Отправить')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2,15 L8,2 L14,15 Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
