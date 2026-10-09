import { InjectionToken, isDevMode } from '@angular/core';

/** Whether the service worker is used at all: production builds only, unless `provideAppPwa({ enabled })` says so. */
export const PWA_ENABLED = new InjectionToken<boolean>('CC_PWA_ENABLED', {
  providedIn: 'root',
  factory: () => !isDevMode(),
});
