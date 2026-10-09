import { type EnvironmentProviders, inject, Injector, makeEnvironmentProviders } from '@angular/core';
import { CLOCK } from '../data-layer.tokens.ts';
import {
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
} from '../tokens.ts';
import { EngineFacade } from './engine-facade.ts';

/**
 * W3-12: LOAN_PROJECTION_SERVICE, the engine facade over the stores of W3-11 and the CLOCK of W3-10
 * (entities → domain → memoized projections, spec §9).
 */
export function provideEngineFacade(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: LOAN_PROJECTION_SERVICE,
      useFactory: () => {
        const injector = inject(Injector);
        return new EngineFacade({
          loans: inject(LOANS_STORE),
          events: inject(LOAN_EVENTS_STORE),
          balances: inject(REPORTED_BALANCES_STORE),
          payments: inject(PAYMENTS_STORE),
          scenarios: inject(SCENARIOS_STORE),
          // TODO(W3 close): W3-10 is not on main yet; switch to `clock: () => clock` with inject(CLOCK) to fail fast.
          clock: () => injector.get(CLOCK),
        });
      },
    },
  ]);
}
