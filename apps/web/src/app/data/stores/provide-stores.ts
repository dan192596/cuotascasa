import { type EnvironmentProviders, makeEnvironmentProviders, type Signal, signal } from '@angular/core';
import type { DeviceSettingsValues, Loan, ThemePreference, Uuid } from '@cuotascasa/schema';
import {
  DataError,
  type LoanChildStore,
  type LoanEventsStore,
  type LoansStore,
  type PaymentsStore,
  type ReportedBalancesStore,
  type ScenariosStore,
  type SettingsStore,
} from '../api.ts';
import {
  LOAN_EVENTS_STORE,
  LOANS_STORE,
  PAYMENTS_STORE,
  REPORTED_BALANCES_STORE,
  SCENARIOS_STORE,
  SETTINGS_STORE,
} from '../tokens.ts';

/** Inert W0-05 stub; W3-11 replaces this file (same export) and deletes stub.spec.ts. */
export const CC_STUB = 'CC_STUB:W3-11';

const EMPTY: Signal<readonly never[]> = signal([]).asReadonly();
const READY = signal(true).asReadonly();

function rejectWrite(): Promise<never> {
  return Promise.reject(new DataError('NOT_IMPLEMENTED', CC_STUB));
}

class InertChildStore<T, TDraft, TUpdate> implements LoanChildStore<T, TDraft, TUpdate> {
  readonly ccStub = CC_STUB;
  readonly ready = READY;
  listByLoan(): Signal<readonly T[]> {
    return EMPTY;
  }
  create(): Promise<T> {
    return rejectWrite();
  }
  update(): Promise<T> {
    return rejectWrite();
  }
  delete(): Promise<void> {
    return rejectWrite();
  }
}

class InertLoansStore implements LoansStore {
  readonly ccStub = CC_STUB;
  readonly ready = READY;
  readonly loans = EMPTY;
  loan(): Signal<Loan | undefined> {
    return signal<Loan | undefined>(undefined).asReadonly();
  }
  create(): Promise<Loan> {
    return rejectWrite();
  }
  createWithAnchor(): Promise<never> {
    return rejectWrite();
  }
  update(): Promise<Loan> {
    return rejectWrite();
  }
  setStatus(): Promise<Loan> {
    return rejectWrite();
  }
  delete(): Promise<void> {
    return rejectWrite();
  }
  isCurrencyLocked(): Signal<boolean> {
    return signal(false).asReadonly();
  }
}

class InertScenariosStore extends InertChildStore<never, never, never> implements ScenariosStore {
  activeScenarioId(): Signal<Uuid | null> {
    return signal<Uuid | null>(null).asReadonly();
  }
  setActiveScenario(): Promise<void> {
    return rejectWrite();
  }
}

class InertSettingsStore implements SettingsStore {
  readonly ccStub = CC_STUB;
  readonly ready = READY;
  readonly device = signal<DeviceSettingsValues>({ theme: 'system', driveSyncEnabled: false }).asReadonly();
  readonly theme = signal<ThemePreference>('system').asReadonly();
  saveDevice(): Promise<void> {
    return rejectWrite();
  }
  setTheme(): Promise<void> {
    return rejectWrite();
  }
}

/** W3-11: signal stores over the DataStore. The stub reads nothing and rejects every write. */
export function provideStores(): EnvironmentProviders {
  const loans: LoansStore = new InertLoansStore();
  const events: LoanEventsStore = new InertChildStore();
  const reportedBalances: ReportedBalancesStore = new InertChildStore();
  const payments: PaymentsStore = new InertChildStore();
  const scenarios: ScenariosStore = new InertScenariosStore();
  const settings: SettingsStore = new InertSettingsStore();
  return makeEnvironmentProviders([
    { provide: LOANS_STORE, useValue: loans },
    { provide: LOAN_EVENTS_STORE, useValue: events },
    { provide: REPORTED_BALANCES_STORE, useValue: reportedBalances },
    { provide: PAYMENTS_STORE, useValue: payments },
    { provide: SCENARIOS_STORE, useValue: scenarios },
    { provide: SETTINGS_STORE, useValue: settings },
  ]);
}
