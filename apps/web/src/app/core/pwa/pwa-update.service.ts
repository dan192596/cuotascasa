import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

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

/** Tracks the Angular service worker's `VERSION_READY` and applies it (activate, then reload). */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  // Optional: specs and pages without provideAppPwa() have no SwUpdate; the service is then inert.
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly reload = inject(RELOAD_PAGE);
  private readonly ready = signal(false);

  readonly updateReady = computed(() => this.ready());

  constructor() {
    this.swUpdate?.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.ready.set(true);
    });
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
