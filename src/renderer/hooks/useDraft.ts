// src/renderer/hooks/useDraft.ts
import { useState, useEffect, useCallback } from 'react';

const DRAFT_PREFIX = 'draft:';
const DEBOUNCE_MS = 500;

/**
 * Persists chat input draft in localStorage keyed by taskId.
 * Returns [text, setText, clearDraft].
 * - setText('') removes the entry immediately (used on send).
 * - Non-empty text is written after 500ms debounce.
 * - Switching taskId loads the new task's saved draft.
 */
export function useDraft(
  taskId: string | null,
): [string, (v: string) => void, () => void] {
  const key = taskId ? `${DRAFT_PREFIX}${taskId}` : null;

  const [text, setTextState] = useState<string>(() =>
    key ? (localStorage.getItem(key) ?? '') : '',
  );

  // Load draft for the new task when taskId changes.
  useEffect(() => {
    setTextState(key ? (localStorage.getItem(key) ?? '') : '');
  }, [key]);

  // Debounced save for non-empty text.
  useEffect(() => {
    if (!key || text === '') return;
    const timer = setTimeout(() => {
      localStorage.setItem(key, text);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, text]);

  const setText = useCallback(
    (v: string) => {
      setTextState(v);
      if (key && v === '') localStorage.removeItem(key);
    },
    [key],
  );

  const clearDraft = useCallback(() => {
    setTextState('');
    if (key) localStorage.removeItem(key);
  }, [key]);

  return [text, setText, clearDraft];
}
