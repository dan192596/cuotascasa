/**
 * Fake stores built from the data/api.ts interfaces (the engine facade tests run apart from W3-10 and W3-11).
 * Writable signals drive «the stores changed» in the memo tests.
 */
import { computed, type Signal, signal } from '@angular/core';
import type { Clock } from '@cuotascasa/persistence';
import type { Loan, Scenario, Uuid } from '@cuotascasa/schema';
import { DataError, type LoanChildStore, type LoansStore, type ScenariosStore } from '../../api.ts';

const notImplemented = (): Promise<never> => Promise.reject(new DataError('NOT_IMPLEMENTED'));

export class FakeLoansStore implements LoansStore {
  readonly readySignal = signal(true);
  readonly ready = this.readySignal.asReadonly();
  readonly loansSignal = signal<readonly Loan[]>([]);
  readonly loans = this.loansSignal.asReadonly();

  loan(id: Uuid): Signal<Loan | undefined> {
    return computed(() => this.loansSignal().find((loan) => loan.id === id));
  }

  readonly create = notImplemented;
  readonly createWithAnchor = notImplemented;
  readonly update = notImplemented;
  readonly setStatus = notImplemented;
  readonly delete = notImplemented;

  isCurrencyLocked(): Signal<boolean> {
    return signal(false).asReadonly();
  }
}

/** Child store keeping every record in one list; `listByLoan` filters into a fresh array like the real store may. */
export class FakeChildStore<T extends { readonly id: Uuid; readonly loanId: Uuid }> implements LoanChildStore<
  T,
  never,
  never
> {
  readonly readySignal = signal(true);
  readonly ready = this.readySignal.asReadonly();
  private readonly all = signal<readonly T[]>([]);

  setAll(records: readonly T[]): void {
    this.all.set(records);
  }

  listByLoan(loanId: Uuid): Signal<readonly T[]> {
    return computed(() => this.all().filter((record) => record.loanId === loanId));
  }

  readonly create = notImplemented;
  readonly update = notImplemented;
  readonly delete = notImplemented;
}

export class FakeScenariosStore extends FakeChildStore<Scenario> implements ScenariosStore {
  private readonly active = signal<ReadonlyMap<Uuid, Uuid | null>>(new Map());

  setActive(loanId: Uuid, scenarioId: Uuid | null): void {
    this.active.update((current) => new Map(current).set(loanId, scenarioId));
  }

  activeScenarioId(loanId: Uuid): Signal<Uuid | null> {
    return computed(() => this.active().get(loanId) ?? null);
  }

  readonly setActiveScenario = notImplemented;
}

export class FakeClock implements Clock {
  private readonly todayValue: string;

  constructor(todayValue: string) {
    this.todayValue = todayValue;
  }

  today(): string {
    return this.todayValue;
  }

  now(): string {
    return '2026-01-01T00:00:00.000Z';
  }
}
