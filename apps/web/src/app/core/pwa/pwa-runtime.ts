import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { provideServiceWorker, SwUpdate, type SwRegistrationOptions } from '@angular/service-worker';
import { SW_SCRIPT_URL, SwRegistrar } from './sw-registrar.ts';

/**
 * Everything that needs `@angular/service-worker` or the Trusted Types policy lives in this module, which is only ever
 * reached through a dynamic `import()` (first NavigationEnd into /app, ADR-0023). The root providers and the public
 * pages never load it. `provideServiceWorker()` runs in a child injector created here, so `SwUpdate` can be injected
 * without `@angular/service-worker` entering the initial bundle of `/`.
 */

type RegistrationStrategy = Exclude<NonNullable<SwRegistrationOptions['registrationStrategy']>, string>;

/**
 * A strategy that never emits (`rxjs` NEVER): Angular only calls `.subscribe(...)` on it, and its own registration would
 * pass a plain string that Trusted Types rejects. Declared structurally because `core/pwa` may not import rxjs
 * (ADR-0010 matrix).
 */
const NEVER_REGISTER = (() => ({
  subscribe: () => ({ unsubscribe: () => undefined }),
})) as unknown as RegistrationStrategy;

const children = new WeakMap<EnvironmentInjector, EnvironmentInjector>();

function childOf(parent: EnvironmentInjector): EnvironmentInjector {
  let child = children.get(parent);
  if (child === undefined) {
    child = createEnvironmentInjector(
      [provideServiceWorker(SW_SCRIPT_URL, { enabled: true, registrationStrategy: NEVER_REGISTER })],
      parent,
    );
    children.set(parent, child);
  }
  return child;
}

/** Registers `/ngsw-worker.js` with scope `/` through the `cc-sw-loader` policy. */
export async function registerWorker(parent: EnvironmentInjector): Promise<void> {
  await parent.get(SwRegistrar).register();
}

/** The `SwUpdate` of the app, or `null` when the worker is disabled (dev mode). */
export function loadSwUpdate(parent: EnvironmentInjector, enabled: boolean): Promise<SwUpdate | null> {
  return Promise.resolve(enabled ? childOf(parent).get(SwUpdate) : null);
}
