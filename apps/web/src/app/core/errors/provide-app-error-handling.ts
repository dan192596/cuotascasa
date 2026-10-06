import { type EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Inert W0-05 stub; W3-09 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W3-09';

const STUB_MARKER = new InjectionToken<string>(CC_STUB);

/** W3-09: global ErrorHandler with a Spanish toast and sanitized production logs. The stub keeps Angular's default. */
export function provideAppErrorHandling(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: STUB_MARKER, useValue: CC_STUB }]);
}
