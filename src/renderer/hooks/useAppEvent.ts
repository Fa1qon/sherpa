import { useEffect, useRef } from 'react';
import type { AppEventName, AppEventMap } from '../../core/domain/app_events';

/**
 * Subscribe to a typed app-wide event pushed from the main process.
 * The handler ref is kept up-to-date without re-subscribing on each render.
 */
export function useAppEvent<K extends AppEventName>(
  eventName: K,
  handler: (payload: AppEventMap[K]) => void,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    return window.sherpa.events.onAppEvent((ev, payload) => {
      if (ev === eventName) {
        handlerRef.current(payload as AppEventMap[K]);
      }
    });
  }, [eventName]);
}
