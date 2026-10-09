import { DOCUMENT } from '@angular/common';
import { computed, EnvironmentInjector, inject, Injectable, InjectionToken, signal } from '@angular/core';
import type { SwUpdate } from '@angular/service-worker';
import { PWA_ENABLED } from './pwa-config.ts';

/** Reloads the page; replaced in specs. */
export const RELOAD_PAGE = new InjectionToken<() => void>('CC_RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => {
      document.location.reload();
    };
  },
});

/** Loads `SwUpdate` on demand (null when the worker is off); replaced in specs. */
export const SW_UPDATE = new InjectionToken<() => Promise<SwUpdate | null>>('CC_SW_UPDATE', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(EnvironmentInjector);
    const enabled = inject(PWA_ENABLED);
    return async () => {
      const runtime = await import('./pwa-runtime.ts');
      return runtime.loadSwUpdate(injector, enabled);
    };
  },
});

/** Tracks the Angular service worker's `VERSION_READY` and applies it (activate, then reload). */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly reload = inject(RELOAD_PAGE);
  private readonly ready = signal(false);
  private swUpdate: SwUpdate | null = null;

  readonly updateReady = computed(() => this.ready());

  constructor() {
    inject(SW_UPDATE)()
      .then((swUpdate) => {
        this.swUpdate = swUpdate;
        swUpdate?.versionUpdates.subscribe((event) => {
          if (event.type === 'VERSION_READY') this.ready.set(true);
        });
      })
      .catch(() => undefined);
  }

  /** Activates the waiting version and reloads. Reloads even if activation fails: the worker may have swapped already. */
  async activateAndReload(): Promise<void> {
    this.ready.set(false);
    try {
      await this.swUpdate?.activateUpdate();
    } catch {
      // Nothing to activate or no worker: a reload is still the right way to pick up the newest files.
    }
    this.reload();
  }
}
