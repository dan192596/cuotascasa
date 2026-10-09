import { isPlatformBrowser } from '@angular/common';
import {
  type EnvironmentProviders,
  ErrorHandler,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideEnvironmentInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { provideServiceWorker, type SwRegistrationOptions } from '@angular/service-worker';
import { isAppUrl, SW_SCRIPT_URL, SwRegistrar } from './sw-registrar.ts';

type RegistrationStrategy = NonNullable<SwRegistrationOptions['registrationStrategy']>;

/**
 * A strategy that never emits (`rxjs` NEVER): Angular only calls `.subscribe(...)` on it. Declared structurally because
 * `core/pwa` may not import rxjs (ADR-0010 matrix).
 */
const NEVER_REGISTER = (() => ({
  subscribe: () => ({ unsubscribe: () => undefined }),
})) as unknown as Exclude<RegistrationStrategy, string>;

export interface AppPwaOptions {
  /** Defaults to production builds only (`!isDevMode()`). */
  readonly enabled?: boolean;
}

/**
 * ADR-0023: service worker with scope `/`, registered by hand the first time the router ends a navigation inside
 * `/app`. `/`, `/privacidad` and the 404 never call `register()` and never create the Trusted Types policy.
 * `provideServiceWorker()` stays only so `SwUpdate` can be injected; its own registration (a plain string, which
 * Trusted Types rejects) never runs because the strategy never emits.
 */
export function provideAppPwa(options: AppPwaOptions = {}): EnvironmentProviders {
  const enabled = options.enabled ?? !isDevMode();
  return makeEnvironmentProviders([
    provideServiceWorker(SW_SCRIPT_URL, { enabled, registrationStrategy: NEVER_REGISTER }),
    provideEnvironmentInitializer(() => {
      if (!enabled || !isPlatformBrowser(inject(PLATFORM_ID))) return;
      const registrar = inject(SwRegistrar);
      const errors = inject(ErrorHandler);
      const router = inject(Router);
      const subscription = router.events.subscribe((event) => {
        if (!(event instanceof NavigationEnd) || !isAppUrl(event.urlAfterRedirects)) return;
        subscription.unsubscribe();
        registrar.register().catch((error: unknown) => {
          errors.handleError(error);
        });
      });
    }),
  ]);
}
