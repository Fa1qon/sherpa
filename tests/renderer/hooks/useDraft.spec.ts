// tests/renderer/hooks/useDraft.spec.ts
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraft } from '../../../src/renderer/hooks/useDraft';

describe('useDraft', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  test('returns empty string when no saved draft', () => {
    const { result } = renderHook(() => useDraft('task-1'));
    expect(result.current[0]).toBe('');
  });

  test('loads saved draft for the given taskId on mount', () => {
    localStorage.setItem('draft:task-1', 'hello world');
    const { result } = renderHook(() => useDraft('task-1'));
    expect(result.current[0]).toBe('hello world');
  });

  test('switches to the new task draft when taskId changes', () => {
    localStorage.setItem('draft:task-a', 'aaa');
    localStorage.setItem('draft:task-b', 'bbb');
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useDraft(id),
      { initialProps: { id: 'task-a' } },
    );
    expect(result.current[0]).toBe('aaa');
    rerender({ id: 'task-b' });
    expect(result.current[0]).toBe('bbb');
  });

  test('setText saves immediately when text is set to empty string (clear-on-send)', () => {
    localStorage.setItem('draft:task-1', 'pending text');
    const { result } = renderHook(() => useDraft('task-1'));
    act(() => { result.current[1](''); });
    expect(localStorage.getItem('draft:task-1')).toBeNull();
  });

  test('clearDraft resets text and removes from localStorage', () => {
    localStorage.setItem('draft:task-1', 'hello');
    const { result } = renderHook(() => useDraft('task-1'));
    act(() => { result.current[2](); });
    expect(result.current[0]).toBe('');
    expect(localStorage.getItem('draft:task-1')).toBeNull();
  });

  test('returns empty string when taskId is null', () => {
    const { result } = renderHook(() => useDraft(null));
    expect(result.current[0]).toBe('');
  });

  test('debounce: does NOT write immediately on text change', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDraft('task-1'));
    act(() => { result.current[1]('typing...'); });
    // Before debounce fires — no write yet
    expect(localStorage.getItem('draft:task-1')).toBeNull();
    act(() => { vi.advanceTimersByTime(600); });
    expect(localStorage.getItem('draft:task-1')).toBe('typing...');
    vi.useRealTimers();
  });
});
