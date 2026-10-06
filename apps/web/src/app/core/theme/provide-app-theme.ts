import { type EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Inert W0-05 stub; W3-05 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W3-05';

const STUB_MARKER = new InjectionToken<string>(CC_STUB);

/** W3-05: ThemeService (system | light | dark). The stub sets no theme: the page follows the system. */
export function provideAppTheme(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: STUB_MARKER, useValue: CC_STUB }]);
}
