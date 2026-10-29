/** Test harness: fake stores wired to the facade through the frozen tokens. */
import { TestBed } from '@angular/core/testing';
import type { ActualPayment, LoanEvent, ReportedBalance, Scenario } from '@cuotascasa/schema';
import { CLOCK } from '../../data-layer.tokens.ts';
import type { LoanProjectionService } from '../../api.ts';
import {
  LOAN_EVENTS_STORE,
  LOAN_PROJECTION_SERVICE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
} from '../../tokens.ts';
import { provideEngineFacade } from '../provide-engine-facade.ts';
import { FakeChildStore, FakeClock, FakeLoansStore, FakeScenariosStore } from './fake-stores.ts';

export interface World {
  readonly service: LoanProjectionService;
  readonly loans: FakeLoansStore;
  readonly events: FakeChildStore<LoanEvent>;
  readonly balances: FakeChildStore<ReportedBalance>;
  readonly payments: FakeChildStore<ActualPayment>;
  readonly scenarios: FakeScenariosStore;
  /** Mutable: setToday() moves the calendar. */
  readonly clock: FakeClock;
}

export function createWorld(today = '2025-03-15'): World {
  const loans = new FakeLoansStore();
  const events = new FakeChildStore<LoanEvent>();
  const balances = new FakeChildStore<ReportedBalance>();
  const payments = new FakeChildStore<ActualPayment>();
  const scenarios = new FakeScenariosStore();
  const clock = new FakeClock(today);
  TestBed.configureTestingModule({
    providers: [
      { provide: LOANS_STORE, useValue: loans },
      { provide: LOAN_EVENTS_STORE, useValue: events },
      { provide: REPORTED_BALANCES_STORE, useValue: balances },
      { provide: PAYMENTS_STORE, useValue: payments },
      { provide: SCENARIOS_STORE, useValue: scenarios },
      { provide: CLOCK, useValue: clock },
      provideEngineFacade(),
    ],
  });
  return { service: TestBed.inject(LOAN_PROJECTION_SERVICE), loans, events, balances, payments, scenarios, clock };
}

export type { Scenario };
