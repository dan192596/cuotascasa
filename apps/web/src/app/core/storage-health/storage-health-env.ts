import { InjectionToken } from '@angular/core';
import type { BrowserProbe } from './safari-detect.ts';

/** The slice of navigator.storage the service uses; absent in browsers without the API. */
export interface StorageManagerLike {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
  estimate(): Promise<{ usage?: number; quota?: number }>;
}

export interface StorageHealthEnv {
  readonly browser: BrowserProbe;
  readonly storage: StorageManagerLike | undefined;
}

/** Defaults to the real navigator; tests provide fakes. Reading it touches no storage. */
export const STORAGE_HEALTH_ENV = new InjectionToken<StorageHealthEnv>('StorageHealthEnv', {
  providedIn: 'root',
  factory: () => {
    const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { standalone?: boolean });
    const matches = typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)').matches : false;
    return {
      browser: {
        userAgent: nav?.userAgent ?? '',
        displayModeStandalone: matches,
        navigatorStandalone: nav?.standalone,
      },
      storage: nav !== undefined && 'storage' in nav ? nav.storage : undefined,
    };
  },
});
