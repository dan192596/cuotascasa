/** Frozen root providers (W0-05; only Opus edits them, planned in W2-02). */
import { registerLocaleData } from '@angular/common';
import localeEsGt from '@angular/common/locales/es-GT';
import {
  type ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { routes } from './app.routes.ts';
import { provideAppErrorHandling } from './core/errors/provide-app-error-handling.ts';
import { provideAppPwa } from './core/pwa/provide-app-pwa.ts';
import { provideAppTheme } from './core/theme/provide-app-theme.ts';

registerLocaleData(localeEsGt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    provideClientHydration(withEventReplay()),
    { provide: LOCALE_ID, useValue: 'es-GT' },
    provideAppErrorHandling(),
    provideAppTheme(),
    provideAppPwa(),
  ],
};
