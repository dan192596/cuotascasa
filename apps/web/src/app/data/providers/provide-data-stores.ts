import { type EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Inert W0-05 stub; W3-10 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W3-10';

const STUB_MARKER = new InjectionToken<string>(CC_STUB);

/** W3-10: DATA_STORE, CLOCK and ID_GENERATOR (data-layer.tokens.ts). The stub provides none of them. */
export function provideDataStores(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: STUB_MARKER, useValue: CC_STUB }]);
}
