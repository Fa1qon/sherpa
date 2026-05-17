// Popup shown when the agent calls AskUserQuestion during a turn.
// Displays questions + options; clicking an option sends the answer as a message.
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentMessage } from '../../../core/domain/agent';
import styles from './AskUserQuestionPopup.module.css';

interface QuestionOption {
  label: string;
  description?: string;
}

interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: QuestionOption[];
}

function getLastQuestion(thread: readonly AgentMessage[]): {
  msgId: string;
  questions: Question[];
} | null {
  for (let i = thread.length - 1; i >= 0; i--) {
    const msg = thread[i];
    if (msg?.toolCall?.name === 'AskUserQuestion') {
      const raw = msg.toolCall.args['questions'];
      if (Array.isArray(raw) && raw.length > 0) {
        return { msgId: msg.id, questions: raw as Question[] };
      }
    }
  }
  return null;
}

interface Props {
  readonly thread: readonly AgentMessage[];
  readonly sending: boolean;
  readonly onAnswer: (text: string) => void;
}

export function AskUserQuestionPopup({ thread, sending, onAnswer }: Props): ReactElement | null {
  const { t } = useTranslation();
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  if (sending) return null;

  const found = getLastQuestion(thread);
  if (!found || found.msgId === dismissedId) return null;

  const { msgId, questions } = found;

  const handleAnswer = (label: string): void => {
    setDismissedId(msgId);
    onAnswer(label);
  };

  const handleDismiss = (): void => {
    setDismissedId(msgId);
  };

  return (
    <div className={styles.popup} role="dialog" aria-label={t('askPopup.label', 'Вопрос агента')}>
      <div className={styles.header}>
        <span className={styles.icon}>?</span>
        <span className={styles.headerText}>{t('askPopup.heading', 'Агент спрашивает')}</span>
        <button
          type="button"
          className={styles.dismiss}
          onClick={handleDismiss}
          aria-label={t('common.dismiss', 'Закрыть')}
        >
          ×
        </button>
      </div>
      <div className={styles.body}>
        {questions.map((q, qi) => (
          <div key={qi} className={styles.question}>
            <div className={styles.questionText}>{q.question}</div>
            <div className={styles.options}>
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  type="button"
                  className={styles.option}
                  onClick={() => handleAnswer(opt.label)}
                >
                  <span className={styles.optionLabel}>{opt.label}</span>
                  {opt.description && (
                    <span className={styles.optionDesc}>{opt.description}</span>
                  )}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.option} ${styles.optionOther}`}
                onClick={() => handleAnswer(t('askPopup.other', 'Другое'))}
              >
                <span className={styles.optionLabel}>{t('askPopup.other', 'Другое')}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
