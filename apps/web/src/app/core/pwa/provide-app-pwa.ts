import { isPlatformBrowser } from '@angular/common';
import {
  type EnvironmentProviders,
  ErrorHandler,
  inject,
  EnvironmentInjector,
  InjectionToken,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideEnvironmentInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { isAppUrl } from './app-url.ts';
import { PWA_ENABLED } from './pwa-config.ts';

export interface AppPwaOptions {
  /** Defaults to production builds only (`!isDevMode()`). */
  readonly enabled?: boolean;
}

/** Registers the worker. The default loads `pwa-runtime.ts` on demand, so `/` never downloads it. */
export const REGISTER_WORKER = new InjectionToken<() => Promise<void>>('CC_REGISTER_WORKER', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(EnvironmentInjector);
    return async () => {
      const runtime = await import('./pwa-runtime.ts');
      await runtime.registerWorker(injector);
    };
  },
});

/**
 * ADR-0023: service worker with scope `/`, registered by hand the first time the router ends a navigation inside
 * `/app`. `/`, `/privacidad` and the 404 never load the registration code, never call `register()` and never create
 * the Trusted Types policy. This root piece is deliberately tiny: `@angular/service-worker` and the registrar sit in
 * the lazy `pwa-runtime.ts` chunk (landing bundle budget).
 */
export function provideAppPwa(options: AppPwaOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    ...(options.enabled === undefined ? [] : [{ provide: PWA_ENABLED, useValue: options.enabled }]),
    provideEnvironmentInitializer(() => {
      if (!inject(PWA_ENABLED) || !isPlatformBrowser(inject(PLATFORM_ID))) return;
      const register = inject(REGISTER_WORKER);
      const errors = inject(ErrorHandler);
      const subscription = inject(Router).events.subscribe((event) => {
        if (!(event instanceof NavigationEnd) || !isAppUrl(event.urlAfterRedirects)) return;
        subscription.unsubscribe();
        register().catch((error: unknown) => {
          errors.handleError(error);
        });
      });
    }),
  ]);
}
