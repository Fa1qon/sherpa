import { EventEmitter } from 'node:events';
import type { AppEventMap, AppEventName } from '../../core/domain/app_events';

class AppEventBus extends EventEmitter {
  emit<K extends AppEventName>(event: K, payload: AppEventMap[K]): boolean {
    return super.emit(event as string, payload);
  }

  on<K extends AppEventName>(
    event: K,
    listener: (payload: AppEventMap[K]) => void,
  ): this {
    return super.on(event as string, listener as (...args: unknown[]) => void);
  }

  off<K extends AppEventName>(
    event: K,
    listener: (payload: AppEventMap[K]) => void,
  ): this {
    return super.off(event as string, listener as (...args: unknown[]) => void);
  }
}

export const eventBus = new AppEventBus();
