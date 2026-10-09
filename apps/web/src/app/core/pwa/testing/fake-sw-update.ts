import type { SwUpdate, VersionEvent } from '@angular/service-worker';
import { vi } from 'vitest';

/** The slice of `Observable` that `PwaUpdateService` uses; keeps rxjs out of `core/pwa` (dependency matrix). */
interface VersionUpdates {
  subscribe(next: (event: VersionEvent) => void): { unsubscribe(): void };
}

export interface FakeSwUpdate {
  readonly swUpdate: SwUpdate;
  readonly activateUpdate: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  emit(event: VersionEvent): void;
}

export function createFakeSwUpdate(activate: () => Promise<boolean> = () => Promise.resolve(true)): FakeSwUpdate {
  const listeners: ((event: VersionEvent) => void)[] = [];
  const versionUpdates: VersionUpdates = {
    subscribe(next) {
      listeners.push(next);
      return {
        unsubscribe() {
          listeners.splice(listeners.indexOf(next), 1);
        },
      };
    },
  };
  const activateUpdate = vi.fn(activate);
  const swUpdate = { isEnabled: true, versionUpdates, activateUpdate } as unknown as SwUpdate;
  return {
    swUpdate,
    activateUpdate,
    emit(event) {
      listeners.slice().forEach((listener) => {
        listener(event);
      });
    },
  };
}
