/** Frozen root providers (W0-05; only Opus edits them; W2-02 applied ADR-0021 and ADR-0023). */
import { registerLocaleData } from '@angular/common';
import localeEsGt from '@angular/common/locales/es-GT';
import {
  type ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withRouterConfig } from '@angular/router';
import { routes } from './app.routes.ts';
import { provideAppErrorHandling } from './core/errors/provide-app-error-handling.ts';
import { provideAppPwa } from './core/pwa/provide-app-pwa.ts';
import { provideAppTheme } from './core/theme/provide-app-theme.ts';

registerLocaleData(localeEsGt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    // Event replay stays: its inline scripts are covered by the post-build hashes of ADR-0021.
    provideClientHydration(withEventReplay()),
    { provide: LOCALE_ID, useValue: 'es-GT' },
    provideAppErrorHandling(),
    provideAppTheme(),
    // ADR-0023: registers the service worker only after the first navigation into /app (W3-14 implements it).
    provideAppPwa(),
  ],
};
