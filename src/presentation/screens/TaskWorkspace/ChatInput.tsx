// src/presentation/screens/TaskWorkspace/ChatInput.tsx
import { type ReactElement, type KeyboardEvent, type DragEvent, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTask } from '../../../renderer/store/task';
import { useProject } from '../../../renderer/store/project';
import { useDraft } from '../../../renderer/hooks/useDraft';
import { useChatAttach } from '../../../renderer/store/chat_attach';
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
  const runtimeRunning = useTask((s) => s.runtime.status === 'running');
  const busy = sending || runtimeRunning;
  const send = useTask((s) => s.sendUserMessage);
  const projectPath = useProject((s) => s.current?.path ?? '');
  const pending = useChatAttach((s) => s.pending);
  const consume = useChatAttach((s) => s.consume);
  // textRef is always current: assigned in render body, read in effect.
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const p = consume();
    if (p) {
      const sep = textRef.current.trim() ? '\n\n' : '';
      setText(textRef.current + sep + p);
    }
  }, [pending, consume, setText]);

  const submit = async (): Promise<void> => {
    const v = text.trim();
    if (!v || busy || !projectPath) return;
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

  const handleDragOver = (e: DragEvent<HTMLTextAreaElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: DragEvent<HTMLTextAreaElement>): void => {
    e.preventDefault();
    // Internal drag from FilesPanel
    const relPath = e.dataTransfer.getData('sherpa/relPath');
    if (relPath && projectPath) {
      void (async () => {
        try {
          const content = await window.sherpa.files.readFile(projectPath, relPath);
          const ext = relPath.split('.').pop() ?? '';
          useChatAttach.getState().setPending(`\`\`\`${ext}\n// ${relPath}\n${content}\n\`\`\``);
        } catch {
          useChatAttach.getState().setPending(relPath);
        }
      })();
      return;
    }
    // Native OS file drop fallback
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : '';
        const ext = file.name.split('.').pop() ?? '';
        useChatAttach.getState().setPending(`\`\`\`${ext}\n// ${file.name}\n${content}\n\`\`\``);
      };
      reader.readAsText(file);
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
          data-testid="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          placeholder={t('chat.placeholder', 'Напишите сообщение… (Enter — отправить, Shift+Enter — перенос)')}
          disabled={busy}
          rows={3}
        />
        <button
          type="button"
          data-testid="chat-send-btn"
          className={styles.sendBtn}
          onClick={() => { void submit(); }}
          disabled={!text.trim() || busy || !projectPath}
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
