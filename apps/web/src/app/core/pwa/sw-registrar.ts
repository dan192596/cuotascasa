import { inject, Injectable, InjectionToken } from '@angular/core';

/** ADR-0023: the worker script, absolute, and the only URL the Trusted Types policy accepts. */
export const SW_SCRIPT_URL = '/ngsw-worker.js';
/** ADR-0023 decision 3 and ADR-0021: the name is already listed in the `trusted-types` of /app. */
export const SW_POLICY_NAME = 'cc-sw-loader';

/** The two members of `ServiceWorkerContainer` the registrar uses. `null` when the browser has no service workers. */
export interface ServiceWorkerContainerLike {
  register(scriptURL: string | URL, options?: RegistrationOptions): Promise<unknown>;
}

interface TrustedTypePolicyLike {
  createScriptURL(input: string): unknown;
}

/** The slice of `window.trustedTypes` the registrar uses. */
export interface TrustedTypesLike {
  createPolicy(name: string, rules: { createScriptURL: (input: string) => string }): TrustedTypePolicyLike;
}

export const SW_CONTAINER = new InjectionToken<ServiceWorkerContainerLike | null>('CC_SW_CONTAINER', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null),
});

export const TRUSTED_TYPES = new InjectionToken<TrustedTypesLike | null>('CC_TRUSTED_TYPES', {
  providedIn: 'root',
  factory: () => {
    const candidate = (globalThis as { trustedTypes?: TrustedTypesLike }).trustedTypes;
    return candidate ?? null;
  },
});

/**
 * Registers the Angular service worker by hand (ADR-0023). `navigator.serviceWorker.register()` is a Trusted Types
 * sink, so the URL goes through the `cc-sw-loader` policy, created lazily the first time it is needed and only once
 * per document (CSP without 'allow-duplicates' rejects a second `createPolicy` with the same name).
 */
@Injectable({ providedIn: 'root' })
export class SwRegistrar {
  private readonly container = inject(SW_CONTAINER);
  private readonly trustedTypes = inject(TRUSTED_TYPES);
  private policy: TrustedTypePolicyLike | null = null;

  async register(): Promise<void> {
    if (this.container === null) return;
    // `register` is typed for string | URL; at runtime a TrustedScriptURL is what a Trusted Types page needs.
    const script = this.scriptUrl() as string;
    await this.container.register(script, { scope: '/' });
  }

  private scriptUrl(): unknown {
    if (this.trustedTypes === null) return SW_SCRIPT_URL;
    this.policy ??= this.trustedTypes.createPolicy(SW_POLICY_NAME, {
      createScriptURL: (input) => {
        if (input !== SW_SCRIPT_URL) throw new TypeError(`${SW_POLICY_NAME} only accepts ${SW_SCRIPT_URL}`);
        return input;
      },
    });
    return this.policy.createScriptURL(SW_SCRIPT_URL);
  }
}
