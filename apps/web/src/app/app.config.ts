/** Frozen root providers (W0-05; only Opus edits them; W2-02 applied ADR-0021 and ADR-0023). */
import { DOCUMENT, registerLocaleData } from '@angular/common';
import localeEsGt from '@angular/common/locales/es-GT';
import {
  type ApplicationConfig,
  inject,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {
  provideRouter,
  type ViewTransitionInfo,
  withComponentInputBinding,
  withInMemoryScrolling,
  withRouterConfig,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes.ts';
import { provideAppErrorHandling } from './core/errors/provide-app-error-handling.ts';
import { provideAppPwa } from './core/pwa/provide-app-pwa.ts';
import { provideAppTheme } from './core/theme/provide-app-theme.ts';

registerLocaleData(localeEsGt);

/**
 * W8-02: the router only calls this in a browser that has `document.startViewTransition` (never during prerender).
 * The CSS in view-transitions.css already keeps the root still under reduced motion, but the browser would still swap
 * snapshots; skipping the transition shows the new page at once, in its final state.
 */
function skipTransitionOnReducedMotion({ transition }: ViewTransitionInfo): void {
  const view = inject(DOCUMENT).defaultView;
  if (view?.matchMedia('(prefers-reduced-motion: reduce)').matches === true) {
    transition.skipTransition();
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      // W8-02: the first navigation (hydration of the prerendered page) never animates.
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated: skipTransitionOnReducedMotion }),
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
