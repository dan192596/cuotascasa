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
 * Root class present while a route view transition runs. The dashboard card (features/dashboard/loan-card) reads the
 * same literal to skip its entrance, so the shared-element morph does not jump (W8-04).
 */
const VIEW_TRANSITION_ACTIVE_CLASS = 'cc-view-transition';

/**
 * W8-02: the router only calls this in a browser that has `document.startViewTransition` (never during prerender).
 * The CSS in view-transitions.css already keeps the root still under reduced motion, but the browser would still swap
 * snapshots; skipping the transition shows the new page at once, in its final state.
 *
 * While a transition runs, the browser hit-tests the snapshot overlay, so a press lands on <html> instead of its
 * target (ADR-0026 §5.4). A capture-phase pointerdown skips the transition so the page is live again at once; the
 * residual is that this one press finishes the transition instead of activating what was under it.
 */
let latestTransition = 0;

function onViewTransitionCreated({ transition }: ViewTransitionInfo): void {
  const document = inject(DOCUMENT);
  if (document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches === true) {
    transition.skipTransition();
    return;
  }
  const root = document.documentElement;
  // A newer transition may start while this one still runs: only the latest one may clear the root class.
  const mine = ++latestTransition;
  const skipOnPress = (): void => transition.skipTransition();
  root.classList.add(VIEW_TRANSITION_ACTIVE_CLASS);
  document.addEventListener('pointerdown', skipOnPress, { capture: true });
  const settle = (): void => {
    document.removeEventListener('pointerdown', skipOnPress, { capture: true });
    if (mine === latestTransition) root.classList.remove(VIEW_TRANSITION_ACTIVE_CLASS);
  };
  transition.finished.then(settle, settle);
}

/**
 * The router's view-transition feature (W8-02). The first navigation (hydration of the prerendered page) never
 * animates; the router keeps that "skip next" flag on the options object built here, so each call gives a fresh one
 * (the spec builds its own router instead of depending on which test creates the first one, W9-14).
 */
export function routeViewTransitions(): ReturnType<typeof withViewTransitions> {
  return withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated });
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
      routeViewTransitions(),
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
