import { type EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Inert W0-05 stub; W3-14 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W3-14';

const STUB_MARKER = new InjectionToken<string>(CC_STUB);

/** W3-14: service worker limited to /app per ADR-0023. The stub registers nothing. */
export function provideAppPwa(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: STUB_MARKER, useValue: CC_STUB }]);
}
